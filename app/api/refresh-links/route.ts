import { NextRequest, NextResponse } from "next/server";
import { listCameras } from "@/lib/cameras";
import { isCameraAvailable } from "@/lib/availability";
import { execute } from "@/lib/db";

export const maxDuration = 300;
export const dynamic = "force-dynamic";
const BATCH_SIZE = 200;

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

    const summary = {
      checked: 0,
      markedUnavailable: 0,
      markedAvailable: 0,
      unavailableReasons: {} as Record<string, number>,
      details: [] as Array<{
        id: string;
        status: "available" | "unavailable";
        reason?: string;
      }>,
    };

    let offset = 0;
    while (true) {
      const batch = await listCameras(BATCH_SIZE, offset);
      if (!batch.length) {
        break;
      }
      offset += batch.length;

      for (const camera of batch) {
        summary.checked++;
        try {
          const checkedAt = new Date().toISOString();
          const availability = await isCameraAvailable(camera);
          if (availability.available) {
            // Restore the link_available flag only when it was previously false.
            if (camera.linkAvailable) {
              await execute(
                `UPDATE camera_ytb SET last_check = ? WHERE camera_id = ?`,
                checkedAt,
                camera.id
              );
            } else {
              await execute(
                `UPDATE camera_ytb SET last_check = ?, link_available = 1 WHERE camera_id = ?`,
                checkedAt,
                camera.id
              );
            }

            if (!camera.linkAvailable) {
              summary.markedAvailable++;
              summary.details.push({
                id: camera.id,
                status: "available",
              });
              console.log("[refresh-links] restored", camera.id);
            }
            continue;
          }
          summary.unavailableReasons[availability.reason] =
            (summary.unavailableReasons[availability.reason] ?? 0) + 1;

          await markUnavailable(camera.id, checkedAt);
          summary.markedUnavailable++;
          summary.details.push({
            id: camera.id,
            status: "unavailable",
            reason: availability.reason,
          });
          console.log(
            "[refresh-links] marked unavailable",
            camera.id,
            availability.reason
          );
        } catch (error) {
          console.warn("[refresh-links] failed for camera", camera.id, error);
        }
      }
    }

    return NextResponse.json(summary);
  } catch (error) {
    console.error("[refresh-links]", error);
    return NextResponse.json(
      { error: "Failed to refresh links" },
      { status: 500 }
    );
  }
}

async function markUnavailable(cameraId: string, checkedAt: string) {
  await execute(
    `UPDATE camera_ytb SET link_available = 0, last_check = ? WHERE camera_id = ?`,
    checkedAt,
    cameraId
  );
}
