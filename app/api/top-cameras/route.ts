import { NextRequest, NextResponse } from "next/server";
import { getCameraById } from "@/lib/cameras";
import { buildCameraMeta, fetchAvailableRankings } from "@/lib/rankings";

export const dynamic = "force-dynamic";

/**
 * The best cameras right now, in ranking order, for the thumbnail strip.
 *   ?limit=10      how many (max 30)
 *   ?exclude=ID    leave out the one that is playing
 */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const limit = Math.min(30, Math.max(1, Number(p.get("limit") ?? 10) || 10));
  const exclude = p.get("exclude");

  try {
    // Over-fetch a little: some ranked cameras may have been demoted since.
    const { rows } = await fetchAvailableRankings({ limit: limit + 15, freshnessMinutes: 24 * 60 });
    const now = Date.now();
    const items = [];
    for (const row of rows) {
      if (items.length >= limit) break;
      if (row.camera_id === exclude) continue;
      const camera = await getCameraById(row.camera_id);
      if (!camera || camera.linkAvailable === false || !camera.embedUrl) continue;
      items.push({ camera, meta: buildCameraMeta(row, now) });
    }
    return NextResponse.json(
      { cameras: items },
      { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } }
    );
  } catch (error) {
    console.error("[api/top-cameras]", error);
    return NextResponse.json({ error: "Failed to load cameras" }, { status: 500 });
  }
}
