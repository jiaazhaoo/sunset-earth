import { NextRequest, NextResponse } from "next/server";
import { listCameras } from "@/lib/cameras";
import { getCachedWeatherSnapshot } from "@/lib/weather";
import { scoreCameraWeather } from "@/lib/client-ranking-v2";
import { isCameraAvailable } from "@/lib/availability";
import { execute, fromBool } from "@/lib/db";
import { isTaskLocked, withTaskLock } from "@/lib/task-lock";

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

function parseDateInTimezone(value: string | undefined | null, timezone?: string) {
  if (!value) return null;
  if (value.endsWith("Z") || /[+-]\\d{2}:\\d{2}$/.test(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (!timezone) {
    const d = new Date(`${value}Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  try {
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(value);
    if (!match) return null;
    const [, year, month, day, hour = "00", minute = "00", second = "00"] = match;
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZoneName: "short",
    });
    const refUtc = new Date(`${year}-${month}-${day}T00:00:00Z`);
    const refFormatted = formatter.format(refUtc);
    const refMatch = /(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s*(\d{1,2}):(\d{2}):(\d{2})/.exec(
      refFormatted
    );
    const refLocal = refMatch
      ? new Date(
          Number.parseInt(refMatch[3]),
          Number.parseInt(refMatch[1]) - 1,
          Number.parseInt(refMatch[2]),
          Number.parseInt(refMatch[4]),
          Number.parseInt(refMatch[5]),
          Number.parseInt(refMatch[6])
        )
      : null;
    const offset = refLocal ? refLocal.getTime() - refUtc.getTime() : 0;
    const utcDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
    const result = new Date(utcDate.getTime() - offset);
    return Number.isNaN(result.getTime()) ? null : result;
  } catch (e) {
    const fallback = new Date(`${value}Z`);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
}
