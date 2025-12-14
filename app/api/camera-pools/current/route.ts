import { NextRequest, NextResponse } from "next/server";
import { fetchAvailableRankings } from "@/lib/rankings";
import { getCameraById, getCameraTagsMap } from "@/lib/cameras";
import {
  assignToPool,
  determineCurrentPool,
  POOL_DEFINITIONS,
  type PoolId,
} from "@/lib/camera-pools";
import type { CameraEvaluation } from "@/lib/client-ranking";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function GET(request: NextRequest) {
  try {
    const requestedPoolIdParam = request.nextUrl.searchParams.get("poolId");
    const includeUnavailable =
      request.nextUrl.searchParams.get("includeUnavailable") === "1";
    const includeAll =
      request.nextUrl.searchParams.get("includeAll") === "1";
    const includePool5 =
      request.nextUrl.searchParams.get("includePool5") === "1";
    const requestedPoolId = requestedPoolIdParam
      ? (Number.parseInt(requestedPoolIdParam, 10) as PoolId)
      : null;

    // 1. Fetch all available rankings
    let rankingResult = await fetchAvailableRankings({
      limit: includeAll ? 1000 : 200,
      freshnessMinutes: 30,
    });

    if (!rankingResult.rows.length) {
      // Fallback: use stale data (up to 24 hours)
      console.log("[camera-pools/current] No fresh rankings, using stale data");
      rankingResult = await fetchAvailableRankings({
        limit: includeAll ? 1000 : 200,
        freshnessMinutes: 24 * 60,
      });
    }

    if (!rankingResult.rows.length) {
      return NextResponse.json(
        { error: "No rankings available" },
        { status: 404 }
      );
    }

    // 2. Fetch camera tags for pool assignment
    const cameraIds = rankingResult.rows.map(row => row.camera_id);
    const cameraTagsMap = await getCameraTagsMap(cameraIds);

    // 3. Assign each camera to a pool
    const camerasWithPools = rankingResult.rows
      .map((row) => {
        const evaluation: CameraEvaluation = {
          score: row.score,
          label: row.label as CameraEvaluation["label"],
          isClear: row.is_clear ?? false,
          isDaytime: null, // Simplified - could be enhanced with actual daytime calculation
          weatherClass: row.weather_class as CameraEvaluation["weatherClass"],
          distanceMinutes: row.distance_minutes ?? undefined,
        };

        const tags = cameraTagsMap.get(row.camera_id);
        const poolId = assignToPool(evaluation, tags);

        return {
          cameraId: row.camera_id,
          score: row.score,
          evaluation,
          poolId,
        };
      })
      .filter((item) => includePool5 ? true : item.poolId !== 5); // Filter out pool 5 (low quality) unless requested

    // 3. Determine current pool (or use requested pool)
    const currentPoolId =
      requestedPoolId ?? determineCurrentPool(camerasWithPools);

    // 4. Get cameras in this pool
    const poolCameras = camerasWithPools
      .filter((item) => item.poolId === currentPoolId)
      .sort((a, b) => b.score - a.score);
    const limitedPoolCameras = includeAll
      ? poolCameras
      : poolCameras.slice(0, 30); // Return top 30 cameras

    if (limitedPoolCameras.length === 0) {
      // This pool is empty, try fallback to next pool
      console.log(
        `[camera-pools/current] Pool ${currentPoolId} is empty, trying fallback`
      );
      const fallbackPoolId =
        currentPoolId < 4 ? ((currentPoolId + 1) as PoolId) : 4;
      const fallbackCameras = camerasWithPools
        .filter((item) => item.poolId === fallbackPoolId)
        .sort((a, b) => b.score - a.score);
      const limitedFallbackCameras = includeAll
        ? fallbackCameras
        : fallbackCameras.slice(0, 30);

      if (limitedFallbackCameras.length > 0) {
        const cameraMap = new Map(
          limitedFallbackCameras.map((item) => [item.cameraId, item])
        );
        const cameras = (
          await Promise.all(
            limitedFallbackCameras.map((item) => getCameraById(item.cameraId))
          )
        )
          .filter(
            (camera): camera is NonNullable<typeof camera> =>
              camera !== null &&
              (includeUnavailable ? true : camera.linkAvailable !== false)
          )
          .map((camera) => {
            const poolEntry = cameraMap.get(camera.id);
            return poolEntry
              ? {
                  ...camera,
                  score: poolEntry.score,
                  label: poolEntry.evaluation.label,
                  weatherClass: poolEntry.evaluation.weatherClass,
                }
              : camera;
          });

        return NextResponse.json({
          poolId: fallbackPoolId,
          poolName: POOL_DEFINITIONS[fallbackPoolId].name,
          cameras: cameras.filter(Boolean),
          validUntil: calculateValidUntil(fallbackPoolId),
          totalInPool: fallbackCameras.length,
        });
      }

      return NextResponse.json(
        { error: "No cameras available in any pool" },
        { status: 404 }
      );
    }

    // 5. Fetch full camera details
    const cameraMap = new Map(
      limitedPoolCameras.map((item) => [item.cameraId, item])
    );
    const cameras = (
      await Promise.all(
        limitedPoolCameras.map((item) => getCameraById(item.cameraId))
      )
    )
      .filter(
        (camera): camera is NonNullable<typeof camera> =>
          camera !== null &&
          (includeUnavailable ? true : camera.linkAvailable !== false)
      )
      .map((camera) => {
        const poolEntry = cameraMap.get(camera.id);
        return poolEntry
          ? {
              ...camera,
              score: poolEntry.score,
              label: poolEntry.evaluation.label,
              weatherClass: poolEntry.evaluation.weatherClass,
            }
          : camera;
      });

    // 6. Calculate pool expiration
    const validUntil = calculateValidUntil(currentPoolId);

    return NextResponse.json({
      poolId: currentPoolId,
      poolName: POOL_DEFINITIONS[currentPoolId].name,
      cameras: cameras.filter(Boolean),
      validUntil,
      totalInPool: poolCameras.length,
    });
  } catch (error) {
    console.error("[camera-pools/current] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch camera pool" },
      { status: 500 }
    );
  }
}

function calculateValidUntil(poolId: PoolId): string | null {
  const definition = POOL_DEFINITIONS[poolId];
  if (!definition.validDurationMinutes) {
    return null;
  }

  const validUntil = new Date(
    Date.now() + definition.validDurationMinutes * 60 * 1000
  );
  return validUntil.toISOString();
}
