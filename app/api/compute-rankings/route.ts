import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/auth";
import { listCameras } from "@/lib/cameras";
import { getCachedWeatherSnapshot } from "@/lib/weather";
import { scoreCameraWeather } from "@/lib/client-ranking-v2";
import { execute, fromBool, query } from "@/lib/db";
import { parseDateInTimezone } from "@/lib/time";
import { isTaskLocked, withTaskLock } from "@/lib/task-lock";
import { applyQuality, phaseOf, type FeedbackCounts } from "@/lib/quality";

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

/** Trust a thumbnail's look only if it has been seen changing recently. */
const VISUAL_FRESH_MS = 90 * 60_000;

async function loadVisualFactors(now: Date): Promise<Map<string, number>> {
  const rows = await query<{ camera_id: string; score: number | null; live: number; changed_at: string | null }>(
    `SELECT camera_id, score, live, changed_at FROM camera_visual WHERE live = 1 AND score IS NOT NULL`
  );
  const out = new Map<string, number>();
  for (const r of rows) {
    const changed = r.changed_at ? Date.parse(r.changed_at) : NaN;
    if (Number.isNaN(changed) || now.getTime() - changed > VISUAL_FRESH_MS) continue;
    out.set(String(r.camera_id), r.score ?? 0);
  }
  return out;
}

/** Viewer skips / stays / saves per camera and phase (lib/quality.ts). */
async function loadFeedback(): Promise<Map<string, FeedbackCounts>> {
  const rows = await query<{ camera_id: string; phase: string; skips: number; dwells: number; favs: number }>(
    `SELECT camera_id, phase, skips, dwells, favs FROM camera_feedback`
  );
  return new Map(
    rows.map((r) => [`${r.camera_id}:${r.phase}`, { skips: r.skips, dwells: r.dwells, favs: r.favs }])
  );
}

async function executeComputeRankings() {
  const now = new Date();
  const visualFactors = await loadVisualFactors(now);
  const feedback = await loadFeedback();
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
        // The picture itself: a dull frame in perfect conditions is still
        // dull. The live thumbnail's look (only for thumbnails seen to
        // change), the stream's resolution, what viewers did in this phase
        // and the curator's stars each nudge the conditions score
        // (lib/quality.ts).
        const visual = visualFactors.get(camera.id);
        const score = applyQuality(evaluation.score, {
          visual,
          maxHeight: camera.maxHeight,
          feedback: feedback.get(`${camera.id}:${phaseOf(evaluation.label)}`),
          rating: camera.curatedRating,
        });

        await upsertRanking({
          cameraId: camera.id,
          score,
          label: evaluation.label,
          skyIndex: evaluation.sky?.index,
          skyTitle: evaluation.sky?.title,
          visualScore: visual,
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
          score,
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
  skyIndex?: number;
  skyTitle?: string;
  visualScore?: number;
};

async function upsertRanking(data: RankingData) {
  await execute(
    `INSERT INTO camera_rankings (
       camera_id, score, label, distance_minutes, is_clear, weather_class,
       timezone, sunrise, sunset, next_event_type, next_event_time,
       following_event_type, following_event_time, available, computed_at,
       sky_index, sky_title, visual_score
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(camera_id) DO UPDATE SET
       score = excluded.score,
       label = excluded.label,
       sky_index = excluded.sky_index,
       sky_title = excluded.sky_title,
       visual_score = excluded.visual_score,
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
    data.computedAt.toISOString(),
    data.skyIndex ?? null,
    data.skyTitle ?? null,
    data.visualScore ?? null
  );
}
