import { NextRequest, NextResponse } from "next/server";
import {
  getCameraById,
  getRandomCamera,
  listCameras,
} from "@/lib/cameras";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type SolarEventType = "sunrise" | "sunset";

type RankingRow = {
  camera_id: string;
  score: number | null;
  label: string | null;
  is_clear: boolean | null;
  distance_minutes: number | null;
  weather_class: string | null;
  timezone: string | null;
  sunrise: string | null;
  sunset: string | null;
  next_event_type: SolarEventType | null;
  next_event_time: string | null;
  following_event_type: SolarEventType | null;
  following_event_time: string | null;
};

export async function GET(request: NextRequest) {
  try {
    const cameraId = request.nextUrl.searchParams.get("cameraId");
    const excludeParam = request.nextUrl.searchParams.get("exclude") ?? "";
    const excludeSet = new Set(
      excludeParam
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    );

    // If requesting specific camera metadata
    if (cameraId) {
      const camera = await getCameraById(cameraId);
      if (!camera) {
        return NextResponse.json(
          { error: "Camera not found" },
          { status: 404 }
        );
      }
      if (camera.linkAvailable === false) {
        return NextResponse.json(
          { error: "Camera unavailable" },
          { status: 410 }
        );
      }

      const ranking = await getRanking(cameraId);
      return NextResponse.json({
        camera,
        meta: ranking ? buildMeta(cameraId, ranking) : null,
        rotationReset: false,
      });
    }

    // Find best camera from pre-computed rankings
    const best = await findBestCameraFromRankings(excludeSet);
    if (!best) {
      const fallback = await getFallbackCamera(excludeSet);
      if (fallback) {
        return NextResponse.json({
          camera: fallback,
          meta: null,
          rotationReset: excludeSet.size > 0,
        });
      }

      const resetCandidate = await getFallbackCamera(new Set());
      if (resetCandidate) {
        return NextResponse.json({
          camera: resetCandidate,
          meta: null,
          rotationReset: true,
        });
      }

      const randomCamera = await getRandomCamera();
      return randomCamera
        ? NextResponse.json({
            camera: randomCamera,
            meta: null,
            rotationReset: true,
          })
        : NextResponse.json(
            { error: "No cameras available" },
            { status: 404 }
          );
    }

    return NextResponse.json(best);
  } catch (error) {
    console.error("[api/best-camera] error:", error);
    return NextResponse.json(
      { error: "Failed to find best camera" },
      { status: 500 }
    );
  }
}

async function findBestCameraFromRankings(exclude: Set<string>) {
  // Build exclusion condition
  const exclusionList = Array.from(exclude);

  // Calculate freshness threshold (rankings should be updated within last 24 hours)
  // In development, rankings may not update every hour, so we use a longer threshold
  const freshnessThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Query pre-computed rankings
  let query = supabaseAdmin
    .from("camera_rankings")
    .select("*")
    .eq("available", true)
    .gte("computed_at", freshnessThreshold.toISOString())  // Only fresh data
    .order("score", { ascending: false })
    .order("distance_minutes", { ascending: true })  // Secondary sort: prefer cameras closer to golden hour
    .limit(100);

  if (exclusionList.length > 0) {
    query = query.not("camera_id", "in", `(${exclusionList.join(",")})`);
  }

  const { data: rankings, error } = await query;

  if (error) {
    console.error("[findBestCameraFromRankings] query error:", error);
    return null;
  }

  if (!rankings || rankings.length === 0) {
    return null;
  }

  const totalAvailable = await countAvailableRankings();
  for (const entry of rankings as RankingRow[]) {
    const camera = await getCameraById(entry.camera_id);
    if (!camera) {
      continue;
    }
    if (camera.linkAvailable === false) {
      continue;
    }

    const rotationReset = exclusionList.length >= totalAvailable;
    return {
      camera,
      meta: buildMeta(entry.camera_id, entry),
      rotationReset,
    };
  }
  return null;
}

async function getRanking(cameraId: string) {
  // Accept data up to 24 hours old for individual camera queries
  const freshnessThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const { data, error } = await supabaseAdmin
    .from("camera_rankings")
    .select("*")
    .eq("camera_id", cameraId)
    .gte("computed_at", freshnessThreshold.toISOString())
    .maybeSingle();

  if (error) {
    console.warn("[getRanking] query error:", error);
    return null;
  }

  return (data as RankingRow | null) ?? null;
}

async function countAvailableRankings() {
  const { count, error } = await supabaseAdmin
    .from("camera_rankings")
    .select("*", { count: "exact", head: true })
    .eq("available", true);

  if (error) {
    console.warn("[countAvailableRankings] error:", error);
    return 0;
  }

  return count ?? 0;
}

function buildMeta(cameraId: string, ranking: RankingRow) {
  const events = resolveUpcomingEvents(ranking);
  return {
    cameraId,
    score: ranking.score ?? 0,
    label: ranking.label ?? undefined,
    isClear: ranking.is_clear ?? false,
    distanceMinutes: ranking.distance_minutes ?? undefined,
    weatherClass: ranking.weather_class ?? undefined,
    timezone: ranking.timezone ?? null,
    sunrise: ranking.sunrise ?? undefined,
    sunset: ranking.sunset ?? undefined,
    nextEvent: events[0] ?? null,
    followingEvent: events[1] ?? null,
  };
}

async function getFallbackCamera(exclude: Set<string>) {
  const cameras = await listCameras(500);
  const pool = cameras.filter(
    (camera) => camera.linkAvailable !== false && !exclude.has(camera.id)
  );
  if (!pool.length) {
    return null;
  }
  const index = Math.floor(Math.random() * pool.length);
  return pool[index];
}

function resolveUpcomingEvents(ranking: RankingRow) {
  const events: Array<{ type: SolarEventType; timeISO: string }> = [];
  if (ranking.next_event_type && ranking.next_event_time) {
    events.push({
      type: ranking.next_event_type,
      timeISO: ranking.next_event_time,
    });
  }
  if (ranking.following_event_type && ranking.following_event_time) {
    events.push({
      type: ranking.following_event_type,
      timeISO: ranking.following_event_time,
    });
  }

  if (!events.length) {
    return [];
  }

  const now = Date.now();
  const parsed = events
    .map((event) => {
      const timestamp = Date.parse(event.timeISO);
      if (Number.isNaN(timestamp)) {
        return null;
      }
      return { ...event, timestamp };
    })
    .filter(
      (
        event
      ): event is {
        type: SolarEventType;
        timeISO: string;
        timestamp: number;
      } => Boolean(event)
    )
    .sort((a, b) => a.timestamp - b.timestamp);

  if (!parsed.length) {
    return [];
  }

  const future = parsed.filter((event) => event.timestamp >= now);
  const ordered = future.length ? future : parsed;
  return ordered
    .map((event) => ({
      type: event.type,
      timeISO: new Date(event.timestamp).toISOString(),
    }))
    .slice(0, 2);
}
