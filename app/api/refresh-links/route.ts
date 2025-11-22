import { NextRequest, NextResponse } from "next/server";
import { listCameras } from "@/lib/cameras";
import { isCameraAvailable } from "@/lib/availability";
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
      markedUnavailable: 0,
      markedAvailable: 0,
      unavailableReasons: {} as Record<string, number>,
      details: [] as Array<{
        id: string;
        status: "available" | "unavailable";
        reason?: string;
      }>,
    };

    for (const camera of cameras) {
      try {
        const availability = await isCameraAvailable(camera);
        if (availability.available) {
          if (!camera.linkAvailable) {
            await supabaseAdmin
              .from("camera_ytb")
              .update({ link_available: true })
              .eq("camera_id", camera.id);
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

        // For soft failures like playability_blocked, retry with consent cookie before disabling
        if (availability.reason === "playability_blocked") {
          const retry = await isCameraAvailable(camera, { withConsent: true });
          if (retry.available) {
            summary.details.push({
              id: camera.id,
              status: "available",
            });
            console.log(
              "[refresh-links] playability_blocked recovered with consent",
              camera.id
            );
            continue;
          }
        }

        await markUnavailable(camera.id);
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

async function markUnavailable(cameraId: string) {
  const { error } = await supabaseAdmin
    .from("camera_ytb")
    .update({ link_available: false })
    .eq("camera_id", cameraId);

  if (error) {
    throw new Error(error.message);
  }
}
