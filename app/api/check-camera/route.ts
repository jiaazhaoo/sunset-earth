import { NextRequest, NextResponse } from "next/server";
import { isCameraAvailable } from "@/lib/availability";

type Payload = {
  embedUrl?: string;
  sourceUrl?: string | null;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { camera?: Payload };
    const { camera } = body;

    if (!camera?.embedUrl) {
      return NextResponse.json(
        { error: "Camera data is required" },
        { status: 400 }
      );
    }

    const availability = await isCameraAvailable({
      id: camera.embedUrl,
      name: "probe",
      embedUrl: camera.embedUrl,
      sourceUrl: camera.sourceUrl ?? camera.embedUrl,
      lat: null,
      lng: null,
      timezone: null,
      city: null,
      country: null,
      tags: [],
      hostLink: null,
      ytbTitle: null,
      linkAvailable: true,
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
