import { execute, query, queryOne } from "@/lib/db";

/** One camera on air, with everything /admin/curate shows about it. */
export type CurateRow = {
  camera_id: string;
  placename: string | null;
  city: string | null;
  country: string | null;
  link: string | null;
  max_height: number | null;
  curated_rating: number | null;
  score: number | null;
  label: string | null;
  sky_title: string | null;
  visual_score: number | null;
  video_id: string | null;
  /** camera_visual.score — how the latest live thumbnail looked, 0..1. */
  picture: number | null;
  live: number | null;
  changes: number | null;
  checks: number | null;
  notes: string | null;
  changed_at: string | null;
  skips: number | null;
  dwells: number | null;
  favs: number | null;
};

export async function listCurateRows(): Promise<CurateRow[]> {
  return query<CurateRow>(
    `SELECT c.camera_id, c.placename, c.city, c.country, c.link, c.max_height, c.curated_rating,
            r.score, r.label, r.sky_title, r.visual_score,
            v.video_id, v.score AS picture, v.live, v.changes, v.checks, v.notes, v.changed_at,
            f.skips, f.dwells, f.favs
     FROM camera_ytb c
     LEFT JOIN camera_rankings r ON r.camera_id = c.camera_id
     LEFT JOIN camera_visual v ON v.camera_id = c.camera_id
     LEFT JOIN (
       SELECT camera_id, SUM(skips) AS skips, SUM(dwells) AS dwells, SUM(favs) AS favs
       FROM camera_feedback GROUP BY camera_id
     ) f ON f.camera_id = c.camera_id
     WHERE c.link_available = 1 AND c.retired_at IS NULL
     ORDER BY c.camera_id`
  );
}

/** Store the curator's stars (1..5) or clear them; false if no such camera. */
export async function setCuratedRating(cameraId: string, rating: number | null): Promise<boolean> {
  const exists = await queryOne<{ camera_id: string }>(
    `SELECT camera_id FROM camera_ytb WHERE camera_id = ?`,
    cameraId
  );
  if (!exists) return false;
  await execute(`UPDATE camera_ytb SET curated_rating = ? WHERE camera_id = ?`, rating, cameraId);
  return true;
}
