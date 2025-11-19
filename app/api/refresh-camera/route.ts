import { NextRequest, NextResponse } from "next/server";
import { getCameraById } from "@/lib/cameras";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  calculateSimilarity,
  fetchChannelLiveVideo,
} from "@/lib/youtube";

export async function POST(request: NextRequest) {
  try {
    const { cameraId } = (await request.json()) as {
      cameraId?: string;
    };

    if (!cameraId) {
      return NextResponse.json(
        { error: "cameraId is required" },
        { status: 400 }
      );
    }

    const camera = await getCameraById(cameraId);
    if (!camera || !camera.hostLink) {
      return NextResponse.json(
        { error: "Camera or host link not found" },
        { status: 404 }
      );
    }

    const live = await fetchChannelLiveVideo(camera.hostLink);
    if (!live) {
      return NextResponse.json(
        { updated: false, reason: "No live stream" },
        { status: 404 }
      );
    }

    const referenceTitle = camera.ytbTitle ?? camera.name ?? "";
    const similarity = calculateSimilarity(referenceTitle, live.title ?? "");
    if (similarity < 0.75) {
      return NextResponse.json(
        { updated: false, similarity },
        { status: 202 }
      );
    }

    const newLink = `https://www.youtube.com/watch?v=${live.videoId}`;
    const { error } = await supabaseAdmin
      .from("camera_ytb")
      .update({
        link: newLink,
        ytb_title: live.title,
      })
      .eq("camera_id", cameraId);

    if (error) {
      throw new Error(error.message);
    }

    const updatedCamera = await getCameraById(cameraId);
    return NextResponse.json({
      updated: true,
      camera: updatedCamera,
      similarity,
    });
  } catch (error) {
    console.error("[api/refresh-camera]", error);
    return NextResponse.json(
      { error: "Failed to refresh camera" },
      { status: 500 }
    );
  }
}
