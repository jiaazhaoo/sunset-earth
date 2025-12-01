import { NextRequest, NextResponse } from "next/server";
import { listCameras } from "@/lib/cameras";
import {
  getCachedWeatherSnapshot,
  scoreCameraWeather,
} from "@/lib/weather";
import { isCameraAvailable } from "@/lib/availability";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const BATCH_SIZE = 50;

export async function GET(request: NextRequest) {
  try {
    if (process.env.CRON_SECRET) {
      const auth = request.headers.get("Authorization");
      if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        );
      }
    }

    const now = new Date();
    let offset = 0;
    const summary = {
      processed: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      details: [] as Array<{
        id: string;
        status: "updated" | "skipped" | "error";
        score?: number;
        reason?: string;
      }>,
    };

    while (true) {
      const batch = await listCameras(BATCH_SIZE, offset);
      if (!batch.length) {
        break;
      }
      offset += batch.length;

      for (const camera of batch) {
        summary.processed++;

        try {
          // Skip cameras without coordinates
          if (camera.lat === null || camera.lng === null) {
            summary.skipped++;
            summary.details.push({
              id: camera.id,
              status: "skipped",
              reason: "missing-coordinates",
            });
            continue;
          }

          // Skip explicitly disabled cameras
          if (camera.linkAvailable === false) {
            summary.skipped++;
            summary.details.push({
              id: camera.id,
              status: "skipped",
              reason: "link-unavailable",
            });
            continue;
          }

          // Check availability (uses cache if available)
          const availability = await isCameraAvailable(camera);
          if (!availability.available) {
            // Store as unavailable
            await upsertRanking({
              cameraId: camera.id,
              score: 0,
              available: false,
              computedAt: now,
            });
            summary.skipped++;
            summary.details.push({
              id: camera.id,
              status: "skipped",
              reason: `unavailable-${availability.reason}`,
            });
            continue;
          }

          // Load cached weather; skip if missing
          const weather = await getCachedWeatherSnapshot(camera.id);
          if (!weather) {
            summary.skipped++;
            summary.details.push({
              id: camera.id,
              status: "skipped",
              reason: "missing-weather-cache",
            });
            continue;
          }

          // Score the camera
          const hasCitySkyline = camera.tags?.some((tag) =>
            tag.toLowerCase().includes("city skyline")
          );
          const evaluation = scoreCameraWeather(weather, now, {
            hasCitySkyline,
          });

          // Store ranking
          await upsertRanking({
            cameraId: camera.id,
            score: evaluation.score,
            label: evaluation.label,
            distanceMinutes: evaluation.distanceMinutes,
            isClear: evaluation.isClear,
            weatherClass: evaluation.weatherClass,
            timezone: weather.timezone,
            sunrise: weather.daily?.sunrise?.[0],
            sunset: weather.daily?.sunset?.[0],
            nextEventType: evaluation.nextEvent?.type,
            nextEventTime: evaluation.nextEvent?.time,
            followingEventType: evaluation.followingEvent?.type,
            followingEventTime: evaluation.followingEvent?.time,
            available: true,
            computedAt: now,
          });

          summary.updated++;
          summary.details.push({
            id: camera.id,
            status: "updated",
            score: evaluation.score,
          });
        } catch (error) {
          summary.errors++;
          summary.details.push({
            id: camera.id,
            status: "error",
            reason: error instanceof Error ? error.message : "unknown-error",
          });
          console.warn(
            "[compute-rankings] failed for camera",
            camera.id,
            error
          );
        }
      }
    }

    return NextResponse.json(summary);
  } catch (error) {
    console.error("[compute-rankings]", error);
    return NextResponse.json(
      { error: "Failed to compute rankings" },
      { status: 500 }
    );
  }
}

type RankingData = {
  cameraId: string;
  score: number;
  label?: string;
  distanceMinutes?: number;
  isClear?: boolean;
  weatherClass?: string;
  timezone?: string;
  sunrise?: string;
  sunset?: string;
  nextEventType?: string;
  nextEventTime?: Date;
  followingEventType?: string;
  followingEventTime?: Date;
  available: boolean;
  computedAt: Date;
};

async function upsertRanking(data: RankingData) {
  const { error } = await supabaseAdmin.from("camera_rankings").upsert(
    {
      camera_id: data.cameraId,
      score: data.score,
      label: data.label ?? null,
      distance_minutes: data.distanceMinutes ?? null,
      is_clear: data.isClear ?? false,
      weather_class: data.weatherClass ?? null,
      timezone: data.timezone ?? null,
      sunrise: data.sunrise ? new Date(data.sunrise).toISOString() : null,
      sunset: data.sunset ? new Date(data.sunset).toISOString() : null,
      next_event_type: data.nextEventType ?? null,
      next_event_time: data.nextEventTime?.toISOString() ?? null,
      following_event_type: data.followingEventType ?? null,
      following_event_time: data.followingEventTime?.toISOString() ?? null,
      available: data.available,
      computed_at: data.computedAt.toISOString(),
    },
    { onConflict: "camera_id" }
  );

  if (error) {
    throw new Error(error.message);
  }
}
