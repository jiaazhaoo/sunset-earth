import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

const RANKING_FIELDS =
  "camera_id,score,label,distance_minutes,is_clear,weather_class,timezone,next_event_type,next_event_time,following_event_type,following_event_time,computed_at,available";

export async function fetchAvailableRankings(options: {
  limit?: number;
  freshnessMinutes?: number;
}) {
  const { limit = 100, freshnessMinutes } = options;
  let query = supabaseAdmin
    .from("camera_rankings")
    .select(RANKING_FIELDS, { count: "exact" })
    .eq("available", true)
    .order("score", { ascending: false })
    .limit(limit);

  if (freshnessMinutes !== undefined) {
    const threshold = new Date(
      Date.now() - freshnessMinutes * 60 * 1000
    ).toISOString();
    query = query.gte("computed_at", threshold);
  }

  const { data, error, count } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return {
    rows: data ?? [],
    totalAvailable: typeof count === "number" ? count : null,
  };
}

export async function fetchRankingByCameraId(cameraId: string) {
  const { data, error } = await supabaseAdmin
    .from("camera_rankings")
    .select(RANKING_FIELDS)
    .eq("camera_id", cameraId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ?? null;
}
