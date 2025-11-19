import { NextRequest, NextResponse } from "next/server";
import { listCameras } from "@/lib/cameras";
import { isCameraAvailable } from "@/lib/availability";
import { refreshCamera } from "@/lib/cameraRefresh";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { cleanupEmptyRooms } from "@/lib/roomCleanup";

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
    const summary = {
      checked: cameras.length,
      refreshed: 0,
      markedUnavailable: 0,
      markedAvailable: 0,
    };

    for (const camera of cameras) {
      try {
        const playable = await isCameraAvailable(camera);
        if (playable) {
          if (!camera.linkAvailable) {
            await supabaseAdmin
              .from("camera_ytb")
              .update({ link_available: true })
              .eq("camera_id", camera.id);
            summary.markedAvailable++;
          }
          continue;
        }

        const result = await refreshCamera(camera);
        if (result.updated) {
          summary.refreshed++;
          continue;
        }

        await supabaseAdmin
          .from("camera_ytb")
          .update({ link_available: false })
          .eq("camera_id", camera.id);
        summary.markedUnavailable++;
      } catch (error) {
        console.warn("[refresh-links] failed for camera", camera.id, error);
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
