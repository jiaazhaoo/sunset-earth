import { query, queryOne, toBool } from "@/lib/db";

export type CameraRankingRow = {
  camera_id: string;
  score: number;
  label: string | null;
  distance_minutes: number | null;
  is_clear: boolean | null;
  weather_class: string | null;
  timezone: string | null;
  next_event_type: string | null;
  next_event_time: string | null;
  following_event_type: string | null;
  following_event_time: string | null;
  sunrise: string | null;
  sunset: string | null;
  computed_at: string;
  available: boolean;
};

/** Raw shape as stored in D1 (booleans are INTEGER 0/1). */
type RankingDbRow = Omit<CameraRankingRow, "is_clear" | "available"> & {
  is_clear: number | null;
  available: number | null;
};

const RANKING_FIELDS =
  "camera_id,score,label,distance_minutes,is_clear,weather_class,timezone,next_event_type,next_event_time,following_event_type,following_event_time,sunrise,sunset,computed_at,available";

function mapRankingRow(row: RankingDbRow): CameraRankingRow {
  return {
    ...row,
    is_clear: toBool(row.is_clear),
    available: toBool(row.available),
  };
}

export async function fetchAvailableRankings(options: {
  limit?: number;
  freshnessMinutes?: number;
}) {
  const { limit = 100, freshnessMinutes } = options;

  // ISO-8601 UTC strings compare lexicographically in the same order as time,
  // so a plain string >= comparison works as a freshness filter.
  const threshold =
    freshnessMinutes !== undefined
      ? new Date(Date.now() - freshnessMinutes * 60 * 1000).toISOString()
      : null;

  const where =
    threshold !== null
      ? "available = 1 AND computed_at >= ?"
      : "available = 1";
  const params = threshold !== null ? [threshold] : [];

  const rows = await query<RankingDbRow>(
    `SELECT ${RANKING_FIELDS} FROM camera_rankings
     WHERE ${where}
     ORDER BY score DESC, distance_minutes ASC
     LIMIT ?`,
    ...params,
    limit
  );

  // SQLite has no equivalent of PostgREST's `count: "exact"`, so the total is
  // a second query against the same predicate.
  const countRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM camera_rankings WHERE ${where}`,
    ...params
  );

  return {
    rows: rows.map(mapRankingRow),
    totalAvailable: countRow?.total ?? null,
  };
}

export async function fetchRankingByCameraId(cameraId: string) {
  const row = await queryOne<RankingDbRow>(
    `SELECT ${RANKING_FIELDS} FROM camera_rankings WHERE camera_id = ?`,
    cameraId
  );

  return row ? mapRankingRow(row) : null;
}

export type SolarEventType = "sunrise" | "sunset";

export type CameraMeta = {
  cameraId: string;
  score: number;
  label?: string;
  isClear: boolean;
  distanceMinutes?: number;
  weatherClass?: string;
  timezone: string | null;
  sunrise?: string;
  sunset?: string;
  nextEvent: { type: SolarEventType; timeISO: string } | null;
  followingEvent: { type: SolarEventType; timeISO: string } | null;
};

/** The ranking row as the client sees it, with the two closest sun events. */
export function buildCameraMeta(ranking: CameraRankingRow, now = Date.now()): CameraMeta {
  const events = closestSolarEvents(ranking, now);
  return {
    cameraId: String(ranking.camera_id),
    score: ranking.score ?? 0,
    label: ranking.label ?? undefined,
    isClear: Boolean(ranking.is_clear),
    distanceMinutes: ranking.distance_minutes ?? undefined,
    weatherClass: ranking.weather_class ?? undefined,
    timezone: ranking.timezone ?? null,
    sunrise: ranking.sunrise ?? undefined,
    sunset: ranking.sunset ?? undefined,
    nextEvent: events[0] ?? null,
    followingEvent: events[1] ?? null,
  };
}

function closestSolarEvents(ranking: CameraRankingRow, now: number) {
  const all: Array<{ type: SolarEventType; timeISO: string }> = [];
  if (ranking.sunrise) all.push({ type: "sunrise", timeISO: ranking.sunrise });
  if (ranking.sunset) all.push({ type: "sunset", timeISO: ranking.sunset });
  if (ranking.next_event_type && ranking.next_event_time) {
    all.push({ type: ranking.next_event_type as SolarEventType, timeISO: ranking.next_event_time });
  }
  if (ranking.following_event_type && ranking.following_event_time) {
    all.push({ type: ranking.following_event_type as SolarEventType, timeISO: ranking.following_event_time });
  }
  return all
    .map((e) => ({ ...e, ts: Date.parse(e.timeISO) }))
    .filter((e) => !Number.isNaN(e.ts))
    .sort((a, b) => Math.abs(a.ts - now) - Math.abs(b.ts - now))
    .slice(0, 2)
    .map((e) => ({ type: e.type, timeISO: new Date(e.ts).toISOString() }));
}
