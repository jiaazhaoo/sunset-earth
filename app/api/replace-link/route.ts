import { NextRequest, NextResponse } from "next/server";
import { listCameras } from "@/lib/cameras";
import { refreshCamera } from "@/lib/cameraRefresh";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    if (process.env.CRON_SECRET) {
      const auth = request.headers.get("Authorization");
      if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        );
      }
    }

    const cameras = await listCameras(500);
    const disabled = cameras.filter((camera) => camera.linkAvailable === false);

    const summary = {
      checked: disabled.length,
      refreshed: 0,
      failed: 0,
      details: [] as Array<{
        id: string;
        status: "updated" | "skipped" | "error";
        reason?: string;
        similarity?: number;
        newLink?: string | null;
      }>,
    };

    for (const camera of disabled) {
      try {
        const result = await refreshCamera(camera);
        if (result.updated) {
          summary.refreshed++;
          summary.details.push({
            id: camera.id,
            status: "updated",
            similarity: (result as { similarity?: number }).similarity,
            newLink: result.camera?.sourceUrl ?? null,
          });
          console.log("[replace-link] updated", camera.id, {
            similarity: (result as { similarity?: number }).similarity,
            newLink: result.camera?.sourceUrl,
          });
        } else {
          summary.failed++;
          const reason = (result as { reason?: string }).reason ?? "unknown";
          summary.details.push({
            id: camera.id,
            status: "skipped",
            reason,
          });
          console.log("[replace-link] skipped", camera.id, reason);
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

    return NextResponse.json(summary);
  } catch (error) {
    console.error("[replace-link]", error);
    return NextResponse.json(
      { error: "Failed to replace links" },
      { status: 500 }
    );
  }
}
