import { NextRequest, NextResponse } from "next/server";
import { getCameraById, getRandomCamera } from "@/lib/cameras";
import { query, queryOne, placeholders, toBool } from "@/lib/db";

type SolarEventType = "sunrise" | "sunset";

type RankingRow = {
  camera_id: string;
  score: number | null;
  label: string | null;
  /** SQLite INTEGER 0/1. */
  is_clear: number | boolean | null;
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
      if (!camera || camera.linkAvailable === false) {
        return NextResponse.json(
          { error: "Camera not found or unavailable" },
          { status: 404 }
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
      // Fallback to random camera if no rankings available
      const fallback = await getRandomCamera();
      return fallback
        ? NextResponse.json({
            camera: fallback,
            meta: null,
            rotationReset: false,
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

  const excludeSlots = placeholders(exclusionList.length);
  const excludeClause = excludeSlots
    ? ` AND camera_id NOT IN (${excludeSlots})`
    : "";

  // Query pre-computed rankings. Secondary sort prefers cameras closer to
  // golden hour when scores tie.
  const rankings = await query<RankingRow>(
    `SELECT * FROM camera_rankings
     WHERE available = 1 AND computed_at >= ?${excludeClause}
     ORDER BY score DESC, distance_minutes ASC
     LIMIT 100`,
    freshnessThreshold.toISOString(),
    ...exclusionList
  );

  if (!rankings.length) {
    return null;
  }

  // Get the best ranked camera that's not excluded and is available
  for (const ranking of rankings) {
    const camera = await getCameraById(String(ranking.camera_id));

    // Skip cameras that don't exist or have unavailable links
    if (!camera || camera.linkAvailable === false) {
      continue;
    }

    // Check if we've cycled through all cameras
    const totalAvailable = await countAvailableRankings();
    const rotationReset = exclusionList.length >= totalAvailable;

    return {
      camera,
      meta: buildMeta(String(ranking.camera_id), ranking),
      rotationReset,
    };
  }

  // No available cameras found in rankings
  return null;
}

async function getRanking(cameraId: string) {
  // Accept data up to 24 hours old for individual camera queries
  const freshnessThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);

  try {
    return await queryOne<RankingRow>(
      `SELECT * FROM camera_rankings
       WHERE camera_id = ? AND computed_at >= ?`,
      cameraId,
      freshnessThreshold.toISOString()
    );
  } catch (error) {
    console.warn("[getRanking] query error:", error);
    return null;
  }
}

async function countAvailableRankings() {
  try {
    const row = await queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total FROM camera_rankings WHERE available = 1`
    );
    return row?.total ?? 0;
  } catch (error) {
    console.warn("[countAvailableRankings] error:", error);
    return 0;
  }
}

function buildMeta(cameraId: string, ranking: RankingRow) {
  const events = resolveUpcomingEvents(ranking);
  return {
    cameraId,
    score: ranking.score ?? 0,
    label: ranking.label ?? undefined,
    isClear: toBool(ranking.is_clear),
    distanceMinutes: ranking.distance_minutes ?? undefined,
    weatherClass: ranking.weather_class ?? undefined,
    timezone: ranking.timezone ?? null,
    sunrise: ranking.sunrise ?? undefined,
    sunset: ranking.sunset ?? undefined,
    nextEvent: events[0] ?? null,
    followingEvent: events[1] ?? null,
  };
}

function resolveUpcomingEvents(ranking: RankingRow) {
  // Also include sunrise and sunset from the ranking for closest event calculation
  const allEvents: Array<{ type: SolarEventType; timeISO: string }> = [];

  // Add sunrise if available
  if (ranking.sunrise) {
    allEvents.push({
      type: "sunrise",
      timeISO: ranking.sunrise,
    });
  }

  // Add sunset if available
  if (ranking.sunset) {
    allEvents.push({
      type: "sunset",
      timeISO: ranking.sunset,
    });
  }

  // Add next event if available
  if (ranking.next_event_type && ranking.next_event_time) {
    allEvents.push({
      type: ranking.next_event_type,
      timeISO: ranking.next_event_time,
    });
  }

  // Add following event if available
  if (ranking.following_event_type && ranking.following_event_time) {
    allEvents.push({
      type: ranking.following_event_type,
      timeISO: ranking.following_event_time,
    });
  }

  if (!allEvents.length) {
    return [];
  }

  const now = Date.now();
  const parsed = allEvents
    .map((event) => {
      const timestamp = Date.parse(event.timeISO);
      if (Number.isNaN(timestamp)) {
        return null;
      }
      return { ...event, timestamp, distance: Math.abs(timestamp - now) };
    })
    .filter(
      (
        event
      ): event is {
        type: SolarEventType;
        timeISO: string;
        timestamp: number;
        distance: number;
      } => Boolean(event)
    )
    // Sort by distance from now (closest first)
    .sort((a, b) => a.distance - b.distance);

  if (!parsed.length) {
    return [];
  }

  // Return the 2 closest events
  return parsed
    .slice(0, 2)
    .map((event) => ({
      type: event.type,
      timeISO: new Date(event.timestamp).toISOString(),
    }));
}
