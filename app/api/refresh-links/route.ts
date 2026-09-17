import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/auth";
import { listCameras } from "@/lib/cameras";
import { verifyCameras } from "@/lib/linkHealth";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Manual full sweep: probe every camera, available or not, and apply the
 * demotion/restoration policy. The hourly replace-link cron does the
 * available-only half of this on its own; call this after bulk data changes.
 */
export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  try {
    const cameras = await listCameras(500, 0);
    const summary = await verifyCameras(cameras);
    return NextResponse.json(summary);
  } catch (error) {
    console.error("[refresh-links]", error);
    return NextResponse.json(
      { error: "Failed to refresh links" },
      { status: 500 }
    );
  }
}
