import { NextRequest, NextResponse } from "next/server";
import { listCameras } from "@/lib/cameras";
import { isCameraAvailable } from "@/lib/availability";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { cleanupEmptyRooms } from "@/lib/roomCleanup";

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
            const updates: Record<string, unknown> = {
              last_check: checkedAt,
            };
            if (!camera.linkAvailable) {
              updates.link_available = true;
            }

            await supabaseAdmin
              .from("camera_ytb")
              .update(updates)
              .eq("camera_id", camera.id);

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

    const roomsCleanup = await cleanupEmptyRooms();

    return NextResponse.json({
      ...summary,
      roomsCleanup,
    });
  } catch (error) {
    console.error("[refresh-links]", error);
    return NextResponse.json(
      { error: "Failed to refresh links" },
      { status: 500 }
    );
  }
}

async function markUnavailable(cameraId: string, checkedAt: string) {
  const { error } = await supabaseAdmin
    .from("camera_ytb")
    .update({
      link_available: false,
      last_check: checkedAt,
    })
    .eq("camera_id", cameraId);

  if (error) {
    throw new Error(error.message);
  }
}
