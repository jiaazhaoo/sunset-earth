import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: NextRequest) {
  try {
    const { cameraId, available } = (await request.json()) as {
      cameraId?: string;
      available?: boolean;
    };

    if (!cameraId || typeof available !== "boolean") {
      return NextResponse.json(
        { error: "cameraId and available flag are required" },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("camera_ytb")
      .update({
        link_available: available,
      })
      .eq("camera_id", cameraId);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ updated: true });
  } catch (error) {
    console.error("[api/camera-availability]", error);
    return NextResponse.json(
      { error: "Failed to update availability" },
      { status: 500 }
    );
  }
}
