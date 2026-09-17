import { NextRequest, NextResponse } from "next/server";
import { devToolsEnabled, devToolsDisabledResponse } from "@/lib/auth";
import { buildCameraStub, type CameraRecord } from "@/lib/cameras";
import { isCameraAvailable } from "@/lib/availability";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  if (!devToolsEnabled()) return devToolsDisabledResponse();

  const url = request.nextUrl.searchParams.get("url") || "";

  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  // Create a mock camera object
  const mockCamera: CameraRecord = { ...buildCameraStub("test"), embedUrl: url, sourceUrl: url };

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
