import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { buildCameraMeta, type CameraRankingRow } from "@/lib/rankings";

export const dynamic = "force-dynamic";

export type LiveCamera = {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  tag: string | null;
  videoId: string | null;
  meta: ReturnType<typeof buildCameraMeta>;
};

type Row = CameraRankingRow & {
  placename: string | null;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  tag: string | null;
  link: string | null;
};

/**
 * Every camera on air with its ranking, sun times and weather — one call
 * that feeds the headline, TV mode, the explore map and tonight's lineup.
 */
export async function GET() {
  try {
    const rows = await query<Row>(
      `SELECT r.camera_id, r.score, r.label, r.distance_minutes, r.is_clear, r.weather_class,
              COALESCE(r.timezone, c.timezone) AS timezone,
              r.next_event_type, r.next_event_time, r.following_event_type, r.following_event_time,
              r.sunrise, r.sunset, r.computed_at, r.available,
              c.placename, c.city, c.country, c.latitude, c.longitude, c.tag, c.link
       FROM camera_rankings r
       JOIN camera_ytb c ON c.camera_id = r.camera_id
       WHERE r.available = 1 AND c.link_available = 1 AND c.retired_at IS NULL
       ORDER BY r.score DESC, r.distance_minutes ASC`
    );
    const now = Date.now();
    const cameras: LiveCamera[] = rows.map((r) => ({
      id: String(r.camera_id),
      name: r.placename ?? `Camera ${r.camera_id}`,
      city: r.city,
      country: r.country,
      lat: r.latitude,
      lng: r.longitude,
      tag: r.tag ? r.tag.split(",")[0].trim() : null,
      videoId: r.link?.match(/[?&]v=([\w-]{11})/)?.[1] ?? null,
      meta: buildCameraMeta({ ...r, is_clear: Boolean(r.is_clear), available: true }, now),
    }));
    return NextResponse.json(
      { cameras, generatedAt: new Date(now).toISOString() },
      { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } }
    );
  } catch (error) {
    console.error("[api/live-cameras]", error);
    return NextResponse.json({ error: "Failed to load cameras" }, { status: 500 });
  }
}
