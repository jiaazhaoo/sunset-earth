import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// Golden hour: ±30 min around the event. Blue hour: the 45 min beyond that.
const GOLDEN_MIN = 30;
const BLUE_MIN = 45;

type Row = {
  camera_id: string;
  placename: string | null;
  city: string | null;
  country: string | null;
  timezone: string | null;
  score: number | null;
  weather_class: string | null;
  sunrise: string | null;
  sunset: string | null;
  next_event_type: "sunrise" | "sunset" | null;
  next_event_time: string | null;
};

/**
 * Solar events for every camera that is live right now, straight from the
 * rankings compute-rankings refreshes every five minutes. No upstream calls:
 * the previous version hit Open-Meteo once per camera on every page view.
 */
export async function GET() {
  try {
    const rows = await query<Row>(
      `SELECT c.camera_id, c.placename, c.city, c.country,
              COALESCE(r.timezone, c.timezone) AS timezone,
              r.score, r.weather_class, r.sunrise, r.sunset,
              r.next_event_type, r.next_event_time
       FROM camera_rankings r
       JOIN camera_ytb c ON c.camera_id = r.camera_id
       WHERE r.available = 1 AND c.link_available = 1
         AND r.sunrise IS NOT NULL AND r.sunset IS NOT NULL`
    );

    const events = rows.flatMap((row) => {
      const sunrise = new Date(row.sunrise!);
      const sunset = new Date(row.sunset!);
      if (Number.isNaN(sunrise.getTime()) || Number.isNaN(sunset.getTime())) {
        return [];
      }
      const shift = (d: Date, minutes: number) =>
        new Date(d.getTime() + minutes * 60_000).toISOString();
      return [
        {
          cameraId: row.camera_id,
          cameraName: row.placename || `Camera ${row.camera_id}`,
          city: row.city,
          country: row.country || "Unknown",
          timezone: row.timezone || "UTC",
          score: row.score ?? 0,
          weatherClass: row.weather_class,
          nextEvent:
            row.next_event_type && row.next_event_time
              ? { type: row.next_event_type, timeISO: row.next_event_time }
              : null,
          sunrise: sunrise.toISOString(),
          sunset: sunset.toISOString(),
          goldenHourSunrise: { start: shift(sunrise, -GOLDEN_MIN), end: shift(sunrise, GOLDEN_MIN) },
          goldenHourSunset: { start: shift(sunset, -GOLDEN_MIN), end: shift(sunset, GOLDEN_MIN) },
          blueHourMorning: { start: shift(sunrise, -GOLDEN_MIN - BLUE_MIN), end: shift(sunrise, -GOLDEN_MIN) },
          blueHourEvening: { start: shift(sunset, GOLDEN_MIN), end: shift(sunset, GOLDEN_MIN + BLUE_MIN) },
        },
      ];
    });

    return NextResponse.json(
      { events },
      { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } }
    );
  } catch (error) {
    console.error("[global-timeline] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
