import { NextRequest, NextResponse } from "next/server";
import { getCameraById, getRandomCamera } from "@/lib/cameras";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

  // Query pre-computed rankings
  let query = supabaseAdmin
    .from("camera_rankings")
    .select("*")
    .eq("available", true)
    .gte("computed_at", freshnessThreshold.toISOString())  // Only fresh data
    .order("score", { ascending: false })
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

  // Get the best ranked camera that's not excluded
  const bestRanking = rankings[0];
  const camera = await getCameraById(bestRanking.camera_id);

  if (!camera) {
    return null;
  }

  // Check if we've cycled through all cameras
  const totalAvailable = await countAvailableRankings();
  const rotationReset = exclusionList.length >= totalAvailable;

  return {
    camera,
    meta: buildMeta(bestRanking.camera_id, bestRanking),
    rotationReset,
  };
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

  return data;
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

function buildMeta(cameraId: string, ranking: any) {
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
    nextEvent: ranking.next_event_type
      ? {
          type: ranking.next_event_type,
          timeISO: ranking.next_event_time,
        }
      : null,
  };
}
