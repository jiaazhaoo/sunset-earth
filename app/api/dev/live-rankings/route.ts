import { NextResponse } from "next/server";
import { listCameras } from "@/lib/cameras";
import {
  getBulkCachedWeatherSnapshots,
  fetchWeatherSnapshot,
} from "@/lib/weather";
import { scoreCameraWeather, rankCameras } from "@/lib/client-ranking";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function GET() {
  try {
    // Fetch all available cameras
    const allCameras = await listCameras(200);
    const cameras = allCameras.filter(
      (camera) =>
        camera.linkAvailable !== false &&
        camera.lat !== null &&
        camera.lng !== null
    );

    if (cameras.length === 0) {
      return NextResponse.json({
        rankings: [],
        message: "No cameras available",
      });
    }

    // Batch fetch weather data
    const cameraIds = cameras.map((c) => c.id);
    const weatherMap = await getBulkCachedWeatherSnapshots(cameraIds);

    const now = new Date();
    const camerasWithEvaluations = [];

    // Compute scores for all cameras
    for (const camera of cameras) {
      let weather = weatherMap.get(camera.id);
      if (!weather) {
        // Fallback: fetch fresh weather when cache miss
        if (camera.lat === null || camera.lng === null) continue;
        weather = await fetchWeatherSnapshot(camera.lat, camera.lng, camera.id);
      }

      if (!weather) {
        continue;
      }

      const hasCitySkyline = camera.tags?.some((tag) =>
        tag.toLowerCase().includes("city skyline")
      );
      const evaluation = scoreCameraWeather(weather, now, {
        hasCitySkyline,
        sunsetDelayMinutes: camera.sunsetDelay ?? 0,
        sunriseAdvanceMinutes: camera.sunriseAdvance ?? 0,
        tags: camera.tags ?? [],
      });

      camerasWithEvaluations.push({
        camera,
        evaluation,
      });
    }

    // Rank cameras
    const ranked = rankCameras(camerasWithEvaluations);

    // Format response
    const rankings = ranked.map((item) => ({
      cameraId: item.camera.id,
      name: item.camera.name,
      score: item.evaluation.score,
      label: item.evaluation.label,
      isClear: item.evaluation.isClear,
      weatherClass: item.evaluation.weatherClass,
      city: item.camera.city,
      country: item.camera.country,
      nextEvent: item.evaluation.nextEvent
        ? {
            type: item.evaluation.nextEvent.type,
            timeISO: item.evaluation.nextEvent.time.toISOString(),
          }
        : null,
      followingEvent: item.evaluation.followingEvent
        ? {
            type: item.evaluation.followingEvent.type,
            timeISO: item.evaluation.followingEvent.time.toISOString(),
          }
        : null,
    }));

    return NextResponse.json({
      rankings,
      timestamp: now.toISOString(),
      totalCameras: cameras.length,
      rankedCameras: rankings.length,
    });
  } catch (error) {
    console.error("[api/dev/live-rankings] error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch rankings",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
