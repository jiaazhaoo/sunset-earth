import { NextRequest, NextResponse } from "next/server";
import type { CameraRecord } from "@/lib/cameras";
import { isCameraAvailable } from "@/lib/availability";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url") || "";

  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  // Create a mock camera object
  const mockCamera: CameraRecord = {
    id: "test",
    name: "Test Camera",
    embedUrl: url,
    sourceUrl: url,
    lat: null,
    lng: null,
    timezone: null,
    city: null,
    country: null,
    tags: [],
    hostLink: null,
    ytbTitle: null,
    linkAvailable: true,
    sunsetDelay: 0,
    sunriseAdvance: 0,
    lastCheck: null,
    metadata: null,
  };

  console.log(`\n=== Testing availability detection for: ${url} ===\n`);

  const result = await isCameraAvailable(mockCamera, { withConsent: true });

  console.log("Result:", result);

  return NextResponse.json({
    url,
    result,
    expected: {
      available: false,
      reason: "playability_blocked or oembed_error",
    },
  });
}
