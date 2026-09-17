import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/auth";
import { listCameras } from "@/lib/cameras";
import { getCachedWeatherSnapshot } from "@/lib/weather";
import { scoreCameraWeather } from "@/lib/client-ranking-v2";
import { execute, fromBool } from "@/lib/db";
import { parseDateInTimezone } from "@/lib/time";
import { isTaskLocked, withTaskLock } from "@/lib/task-lock";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const BATCH_SIZE = 50;

export async function GET(request: NextRequest) {
  try {
    const denied = requireCronSecret(request);
    if (denied) return denied;

    // Check if weather-cache is still running
    const weatherCacheRunning = await isTaskLocked("weather-cache");
    if (weatherCacheRunning) {
      console.log("[compute-rankings] waiting: weather-cache is still running");
      return NextResponse.json(
        {
          skipped: true,
          reason: "weather-cache is still running, will retry later"
        },
        { status: 409 }
      );
    }

    // Execute with task lock to prevent concurrent execution
    const lockResult = await withTaskLock(
      "compute-rankings",
      async () => executeComputeRankings(),
      { ttlSeconds: 600, lockedBy: "compute-rankings-cron" }
    );

    if (!lockResult.success) {
      console.warn("[compute-rankings] skipped:", lockResult.reason);
      return NextResponse.json(
        {
          skipped: true,
          reason: lockResult.reason
        },
        { status: 409 }
      );
    }

    return NextResponse.json(lockResult.result);
  } catch (error) {
    console.error("[compute-rankings]", error);
    return NextResponse.json(
      { error: "Failed to compute rankings" },
      { status: 500 }
    );
  }
}

async function executeComputeRankings() {
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
        // Availability is whatever link_available says. Live YouTube probes
        // happen in the hourly replace-link sweep (lib/linkHealth.ts), not
        // here: this runs every five minutes and used to re-probe every
        // camera each time.
        //
        // Cameras we cannot score still get a ranking row marked unavailable:
        // otherwise a camera demoted since the last run keeps its old
        // available=1 row, inflating counts and rotation until it is repaired.
        const skipReason =
          camera.lat === null || camera.lng === null
            ? "missing-coordinates"
            : camera.linkAvailable === false
              ? "link-unavailable"
              : null;
        if (skipReason) {
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
            reason: skipReason,
          });
          continue;
        }

        // Load cached weather; skip if missing
        const weather = await getCachedWeatherSnapshot(camera.id);
        if (!weather) {
          // Store as unavailable due to missing weather data
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
            reason: "missing-weather-cache",
          });
          continue;
        }

        // Score the camera using v2 algorithm with metadata
        const evaluation = scoreCameraWeather(weather, now, {
          cameraMetadata: camera.metadata,
          sunsetDelayMinutes: camera.sunsetDelay ?? 0,
          sunriseAdvanceMinutes: camera.sunriseAdvance ?? 0,
          timezone: weather.timezone,
          cameraTags: camera.tags,
        });

        // Store ranking
        const sunriseDate = parseDateInTimezone(
          weather.daily?.sunrise?.[0],
          weather.timezone
        );
        const sunsetDate = parseDateInTimezone(
          weather.daily?.sunset?.[0],
          weather.timezone
        );
        await upsertRanking({
          cameraId: camera.id,
          score: evaluation.score,
          label: evaluation.label,
          distanceMinutes: evaluation.distanceMinutes,
          isClear: evaluation.isClear,
          weatherClass: evaluation.weatherClass,
          timezone: weather.timezone,
          sunrise: sunriseDate?.toISOString(),
          sunset: sunsetDate?.toISOString(),
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

  return summary;
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
  await execute(
    `INSERT INTO camera_rankings (
       camera_id, score, label, distance_minutes, is_clear, weather_class,
       timezone, sunrise, sunset, next_event_type, next_event_time,
       following_event_type, following_event_time, available, computed_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(camera_id) DO UPDATE SET
       score = excluded.score,
       label = excluded.label,
       distance_minutes = excluded.distance_minutes,
       is_clear = excluded.is_clear,
       weather_class = excluded.weather_class,
       timezone = excluded.timezone,
       sunrise = excluded.sunrise,
       sunset = excluded.sunset,
       next_event_type = excluded.next_event_type,
       next_event_time = excluded.next_event_time,
       following_event_type = excluded.following_event_type,
       following_event_time = excluded.following_event_time,
       available = excluded.available,
       computed_at = excluded.computed_at`,
    data.cameraId,
    data.score,
    data.label ?? null,
    data.distanceMinutes ?? null,
    fromBool(data.isClear ?? false),
    data.weatherClass ?? null,
    data.timezone ?? null,
    data.sunrise ? new Date(data.sunrise).toISOString() : null,
    data.sunset ? new Date(data.sunset).toISOString() : null,
    data.nextEventType ?? null,
    data.nextEventTime?.toISOString() ?? null,
    data.followingEventType ?? null,
    data.followingEventTime?.toISOString() ?? null,
    fromBool(data.available),
    data.computedAt.toISOString()
  );
}
