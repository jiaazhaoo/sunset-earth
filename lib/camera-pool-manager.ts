/**
 * Camera Pool Manager
 *
 * Manages camera pool state on the client side, ensuring:
 * - Users stay in the same pool during its validity period
 * - Pool transitions are smooth
 * - Session state is preserved across page refreshes
 */

import type { CameraRecord } from "./cameras";
import type { PoolId } from "./camera-pools";

type PoolResponse = {
  poolId: PoolId;
  poolName: string;
  cameras: CameraRecord[];
  validUntil: string | null;
  totalInPool: number;
};

export class CameraPoolManager {
  private currentPoolId: PoolId | null = null;
  private poolCameras: CameraRecord[] = [];
  private poolValidUntil: Date | null = null;
  private seenInPool: Set<string> = new Set();
  private poolName = "";

  constructor() {
    this.restoreFromSession();
  }

  /**
   * Get the next camera from the current pool
   */
  async getNextCamera(exclude: string[] = [], _recursionDepth = 0): Promise<{
    camera: CameraRecord;
    poolChanged: boolean;
    poolName: string;
  } | null> {
    const startTime = performance.now();

    // Prevent infinite recursion
    if (_recursionDepth > 5) {
      console.error("[PoolManager] Max recursion depth reached, aborting");
      return null;
    }

    // 1. Check if we need to refresh the pool
    if (this.shouldRefreshPool()) {
      console.log("[PoolManager] Refreshing pool...");
      const refreshStart = performance.now();
      const poolChanged = await this.refreshPool();
      console.log(`[PoolManager] Pool refresh took ${Math.round(performance.now() - refreshStart)}ms`);
      if (poolChanged) {
        // Pool changed, clear seen cameras
        this.seenInPool.clear();
        this.saveToSession();
      }
    } else {
      console.log("[PoolManager] Using cached pool");
    }

    // 2. Filter available cameras
    const available = this.poolCameras.filter(
      (cam) => !this.seenInPool.has(cam.id) && !exclude.includes(cam.id)
    );

    console.log(`[PoolManager] Available cameras: ${available.length}/${this.poolCameras.length} (depth: ${_recursionDepth})`);

    // 3. All cameras in pool have been seen
    if (available.length === 0) {
      console.log(
        "[PoolManager] All cameras in pool seen, trying fallback pool"
      );
      const fallbackSuccess = await this.tryFallbackPool();
      if (fallbackSuccess) {
        return this.getNextCamera(exclude, _recursionDepth + 1);
      }
      return null;
    }

    // 4. Return first available camera (already sorted by score)
    const camera = available[0];
    this.seenInPool.add(camera.id);
    this.saveToSession();

    console.log(`[PoolManager] getNextCamera took ${Math.round(performance.now() - startTime)}ms total`);

    return {
      camera,
      poolChanged: false,
      poolName: this.poolName,
    };
  }

  /**
   * Check if pool needs refreshing
   */
  private shouldRefreshPool(): boolean {
    // No pool loaded yet
    if (!this.currentPoolId || this.poolCameras.length === 0) {
      return true;
    }

    // Pool has expired - refresh to get latest cameras
    // This keeps content fresh while maintaining same time period
    // User won't notice since they're still in the same pool (e.g., Pool 1)
    if (this.poolValidUntil && Date.now() >= this.poolValidUntil.getTime()) {
      console.log("[PoolManager] Pool expired, refreshing to get latest cameras");
      return true;
    }

    return false;
  }

  /**
   * Refresh the current pool from the API
   */
  private async refreshPool(): Promise<boolean> {
    const oldPoolId = this.currentPoolId;

    try {
      // If we have a current pool, request that specific pool to maintain stability
      // Otherwise, let the API determine the best pool
      const url = this.currentPoolId
        ? `/api/camera-pools/current?poolId=${this.currentPoolId}`
        : "/api/camera-pools/current";

      const response = await fetch(url, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch pool: ${response.status}`);
      }

      const data: PoolResponse = await response.json();

      this.currentPoolId = data.poolId;
      this.poolCameras = data.cameras;
      this.poolName = data.poolName;
      this.poolValidUntil = data.validUntil
        ? new Date(data.validUntil)
        : null;

      console.log("[PoolManager] Refreshed pool:", {
        requested: this.currentPoolId || 'auto',
        poolId: data.poolId,
        poolName: data.poolName,
        cameraCount: data.cameras.length,
        validUntil: data.validUntil,
      });

      return oldPoolId !== this.currentPoolId;
    } catch (error) {
      console.error("[PoolManager] Failed to refresh pool:", error);
      return false;
    }
  }

  /**
   * Try to get cameras from the next pool when current pool is exhausted
   */
  private async tryFallbackPool(): Promise<boolean> {
    if (!this.currentPoolId) return false;

    // If already at pool 4, refresh pool 4 instead of fallback
    if (this.currentPoolId >= 4) {
      console.log("[PoolManager] Already at pool 4, refreshing current pool");
      // Clear seen list and refresh the same pool
      this.seenInPool.clear();
      const refreshed = await this.refreshPool();
      if (refreshed) {
        console.log("[PoolManager] Pool 4 refreshed successfully");
        return true;
      }
      return false;
    }

    // Try next pools in sequence until we find one with cameras
    for (let poolId = this.currentPoolId + 1; poolId <= 4; poolId++) {
      try {
        console.log(`[PoolManager] Trying fallback to pool ${poolId}`);
        const response = await fetch(
          `/api/camera-pools/current?poolId=${poolId}`,
          {
            cache: "no-store",
          }
        );

        // Pool is empty (404), try next pool
        if (response.status === 404) {
          console.log(`[PoolManager] Pool ${poolId} is empty, trying next pool`);
          continue;
        }

        if (!response.ok) {
          console.warn(`[PoolManager] Pool ${poolId} returned error: ${response.status}`);
          continue;
        }

        const data: PoolResponse = await response.json();

        if (data.cameras.length === 0) {
          console.log(`[PoolManager] Pool ${poolId} has no cameras, trying next pool`);
          continue;
        }

        // Found a pool with cameras!
        this.currentPoolId = data.poolId;
        this.poolCameras = data.cameras;
        this.poolName = data.poolName;
        this.poolValidUntil = data.validUntil
          ? new Date(data.validUntil)
          : null;
        this.seenInPool.clear();
        this.saveToSession();

        console.log("[PoolManager] Successfully fell back to pool:", data.poolId);
        return true;
      } catch (error) {
        console.error(`[PoolManager] Error trying pool ${poolId}:`, error);
        continue;
      }
    }

    // No pools have cameras
    console.error("[PoolManager] All pools are empty!");
    return false;
  }

  /**
   * Reset the pool manager (user manually triggered)
   */
  reset() {
    this.seenInPool.clear();
    this.currentPoolId = null;
    this.poolCameras = [];
    this.poolValidUntil = null;
    this.poolName = "";
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("camera-pool-state");
    }
  }

  /**
   * Save state to session storage
   */
  private saveToSession() {
    if (typeof window === "undefined") return;

    const state = {
      poolId: this.currentPoolId,
      poolName: this.poolName,
      seen: Array.from(this.seenInPool),
      validUntil: this.poolValidUntil?.toISOString(),
    };

    sessionStorage.setItem("camera-pool-state", JSON.stringify(state));
  }

  /**
   * Restore state from session storage
   */
  private restoreFromSession() {
    if (typeof window === "undefined") return;

    const stored = sessionStorage.getItem("camera-pool-state");
    if (!stored) return;

    try {
      const state = JSON.parse(stored);
      this.currentPoolId = state.poolId;
      this.poolName = state.poolName || "";
      this.seenInPool = new Set(state.seen);
      this.poolValidUntil = state.validUntil
        ? new Date(state.validUntil)
        : null;
    } catch (e) {
      console.warn("[PoolManager] Failed to restore session:", e);
    }
  }
}
