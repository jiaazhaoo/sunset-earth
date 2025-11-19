import { NextResponse } from "next/server";
import { listCameras } from "@/lib/cameras";
import { isCameraAvailable } from "@/lib/availability";
import { refreshCamera } from "@/lib/cameraRefresh";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET() {
  try {
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

    return NextResponse.json(summary);
  } catch (error) {
    console.error("[refresh-links]", error);
    return NextResponse.json(
      { error: "Failed to refresh links" },
      { status: 500 }
    );
  }
}
