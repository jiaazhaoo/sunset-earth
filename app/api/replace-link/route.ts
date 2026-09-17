import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/auth";
import { listCameras } from "@/lib/cameras";
import { refreshCamera, type RefreshOptions } from "@/lib/cameraRefresh";

export const maxDuration = 300;
export const dynamic = "force-dynamic";
const BATCH_SIZE = 200;

export async function GET(request: NextRequest) {
  try {
    const denied = requireCronSecret(request);
    if (denied) return denied;

    const summary = {
      checked: 0,
      refreshed: 0,
      failed: 0,
      details: [] as Array<{
        id: string;
        status: "updated" | "skipped" | "error";
        reason?: string;
        similarity?: number;
        bestScore?: number;
        newLink?: string | null;
        newTitle?: string;
      }>,
    };

    // Cameras on the same channel share one fetch of its /streams page.
    const refreshOptions: RefreshOptions = { channelCache: new Map() };

    let offset = 0;
    while (true) {
      const batch = await listCameras(BATCH_SIZE, offset);
      if (!batch.length) {
        break;
      }
      offset += batch.length;

      for (const camera of batch) {
        if (camera.linkAvailable !== false) {
          continue;
        }
        summary.checked++;
        try {
          const result = await refreshCamera(camera, refreshOptions);
          if (result.updated) {
            summary.refreshed++;
            summary.details.push({
              id: camera.id,
              status: "updated",
              similarity: result.similarity,
              newLink: result.camera.sourceUrl ?? null,
              newTitle: result.title,
            });
          } else {
            summary.failed++;
            summary.details.push({
              id: camera.id,
              status: "skipped",
              reason: result.reason,
              bestScore: result.bestScore,
            });
            console.log("[replace-link] skipped", camera.id, result.reason);
          }
        } catch (error) {
          console.warn("[replace-link] failed to refresh", camera.id, error);
          summary.failed++;
          summary.details.push({
            id: camera.id,
            status: "error",
            reason:
              error instanceof Error ? error.message : "unexpected-error",
          });
        }
      }
    }

    // No chaining to weather-cache: it has its own 3-hourly Cron Trigger and
    // compute-rankings runs every 5 minutes, so repaired links are picked up
    // within one ranking cycle anyway. Dropping the chain removes a self-fetch
    // (which cost a subrequest and needed the deployment's own hostname to be
    // configured correctly) for no loss of freshness.
    return NextResponse.json(summary);
  } catch (error) {
    console.error("[replace-link]", error);
    return NextResponse.json(
      { error: "Failed to replace links" },
      { status: 500 }
    );
  }
}
