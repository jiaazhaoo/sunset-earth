import { NextRequest, NextResponse } from "next/server";
import { refreshCameraById } from "@/lib/cameraRefresh";

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

    const result = await refreshCameraById(cameraId);
    if (!result.updated) {
      return NextResponse.json(result, { status: 202 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[api/refresh-camera]", error);
    return NextResponse.json(
      { error: "Failed to refresh camera" },
      { status: 500 }
    );
  }
}
