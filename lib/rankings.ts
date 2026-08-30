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
  computed_at: string;
  available: boolean;
};

/** Raw shape as stored in D1 (booleans are INTEGER 0/1). */
type RankingDbRow = Omit<CameraRankingRow, "is_clear" | "available"> & {
  is_clear: number | null;
  available: number | null;
};

const RANKING_FIELDS =
  "camera_id,score,label,distance_minutes,is_clear,weather_class,timezone,next_event_type,next_event_time,following_event_type,following_event_time,computed_at,available";

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
