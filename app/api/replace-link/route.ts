import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/auth";
import { listCameras } from "@/lib/cameras";
import { refreshCamera, type RefreshOptions } from "@/lib/cameraRefresh";
import { verifyCameras, type VerifySummary } from "@/lib/linkHealth";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

type RepairDetail = {
  id: string;
  status: "updated" | "skipped" | "error";
  reason?: string;
  similarity?: number;
  source?: "channel" | "search";
  bestScore?: number;
  newLink?: string | null;
  newTitle?: string;
};

/**
 * Hourly link maintenance, in two passes:
 *
 * 1. Verify every camera currently shown (link_available = 1). This is the
 *    only place live streams are re-probed on a schedule — compute-rankings
 *    trusts the flag — so a stream that dies is caught within the hour.
 * 2. Repair every camera that is down (including ones just demoted) and not
 *    retired: host channel first, then YouTube search. See lib/cameraRefresh.ts.
 */
export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  try {
    const cameras = await listCameras(500, 0);

    // Pass 1: health of what is on air.
    const verify: VerifySummary = await verifyCameras(
      cameras.filter((camera) => camera.linkAvailable !== false)
    );
    const demotedIds = new Set(
      verify.details.filter((d) => d.outcome === "demoted").map((d) => d.id)
    );

    // Pass 2: repair everything that is down.
    const repair = {
      checked: 0,
      refreshed: 0,
      failed: 0,
      details: [] as RepairDetail[],
    };
    // Cameras on the same channel share one fetch of its /streams page.
    const refreshOptions: RefreshOptions = { channelCache: new Map() };

    for (const camera of cameras) {
      if (camera.linkAvailable !== false && !demotedIds.has(camera.id)) {
        continue;
      }
      // Retired by the weekly discovery run after a month down; the admin
      // page can bring one back, the hourly sweep does not keep trying.
      if (camera.retiredAt) {
        continue;
      }
      repair.checked++;
      try {
        const result = await refreshCamera(
          demotedIds.has(camera.id) ? { ...camera, linkAvailable: false } : camera,
          refreshOptions
        );
        if (result.updated) {
          repair.refreshed++;
          repair.details.push({
            id: camera.id,
            status: "updated",
            similarity: result.similarity,
            source: result.source,
            newLink: result.camera.sourceUrl ?? null,
            newTitle: result.title,
          });
        } else {
          repair.failed++;
          repair.details.push({
            id: camera.id,
            status: "skipped",
            reason: result.reason,
            bestScore: result.bestScore,
          });
        }
      } catch (error) {
        console.warn("[replace-link] failed to refresh", camera.id, error);
        repair.failed++;
        repair.details.push({
          id: camera.id,
          status: "error",
          reason: error instanceof Error ? error.message : "unexpected-error",
        });
      }
    }

    return NextResponse.json({ verify, repair });
  } catch (error) {
    console.error("[replace-link]", error);
    return NextResponse.json(
      { error: "Failed to replace links" },
      { status: 500 }
    );
  }
}
