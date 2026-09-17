import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/auth";
import { isCameraAvailable } from "@/lib/availability";
import { buildCameraStub } from "@/lib/cameras";

type Payload = {
  embedUrl?: string;
  sourceUrl?: string | null;
};

export async function POST(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  try {
    const body = (await request.json()) as { camera?: Payload };
    const { camera } = body;

    if (!camera?.embedUrl) {
      return NextResponse.json(
        { error: "Camera data is required" },
        { status: 400 }
      );
    }

    // Probe whatever URL the caller gave; the stub only needs embed/source.
    const availability = await isCameraAvailable({
      ...buildCameraStub("probe"),
      id: camera.embedUrl,
      embedUrl: camera.embedUrl,
      sourceUrl: camera.sourceUrl ?? camera.embedUrl,
    });

    return NextResponse.json(availability);
  } catch (error) {
    console.error("[api/check-camera]", error);
    return NextResponse.json(
      { error: "Failed to check camera" },
      { status: 500 }
    );
  }
}
