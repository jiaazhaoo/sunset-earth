import { NextRequest, NextResponse } from "next/server";
import { getCameraById, getRandomCamera } from "@/lib/cameras";

export async function GET(request: NextRequest) {
  try {
    const cameraId = request.nextUrl.searchParams.get("cameraId");

    const camera = cameraId
      ? await getCameraById(cameraId)
      : await getRandomCamera();

    if (!camera) {
      return NextResponse.json(
        { error: "Camera not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ camera });
  } catch (error) {
    console.error("[api/best-camera] error:", error);
    return NextResponse.json(
      { error: "Failed to calculate best camera" },
      { status: 500 }
    );
  }
}
