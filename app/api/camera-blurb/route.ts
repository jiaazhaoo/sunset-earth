import { NextRequest, NextResponse } from "next/server";
import { getCameraById } from "@/lib/cameras";
import { execute, queryOne } from "@/lib/db";
import { describePlace } from "@/lib/wikipedia";

export const dynamic = "force-dynamic";

/**
 * GET ?cameraId=ID → { description, source, note }
 * The description is looked up on Wikipedia the first time a camera is asked
 * about and cached in camera_ytb; `note` is the curator's own line (info_0).
 * A miss is cached too (empty string) so we do not ask Wikipedia every view.
 */
export async function GET(request: NextRequest) {
  const cameraId = request.nextUrl.searchParams.get("cameraId");
  if (!cameraId) {
    return NextResponse.json({ error: "cameraId is required" }, { status: 400 });
  }
  const camera = await getCameraById(cameraId);
  if (!camera) {
    return NextResponse.json({ error: "Camera not found" }, { status: 404 });
  }

  const row = await queryOne<{ description: string | null; description_source: string | null; info_0: string | null }>(
    `SELECT description, description_source, info_0 FROM camera_ytb WHERE camera_id = ?`,
    cameraId
  );
  let description = row?.description ?? null;
  let source = row?.description_source ?? null;

  if (description === null) {
    try {
      const found = await describePlace({
        placename: camera.name,
        city: camera.city,
        country: camera.country,
        lat: camera.lat,
        lng: camera.lng,
      });
      description = found?.extract ?? "";
      source = found?.url ?? null;
      await execute(
        `UPDATE camera_ytb SET description = ?, description_source = ? WHERE camera_id = ?`,
        description,
        source,
        cameraId
      );
    } catch (error) {
      // Wikipedia unavailable (rate limit, outage): answer empty, cache nothing.
      console.warn("[camera-blurb] lookup failed", cameraId, error instanceof Error ? error.message : error);
      return NextResponse.json({ description: null, source: null, note: null }, { headers: { "Cache-Control": "no-store" } });
    }
  }

  const note = row?.info_0 && !/^\d+$/.test(row.info_0) ? row.info_0 : null;
  return NextResponse.json(
    { description: description || null, source, note },
    { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } }
  );
}
