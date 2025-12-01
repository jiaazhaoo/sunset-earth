import { NextRequest, NextResponse } from "next/server";
import {
  getCameraById,
  getRandomCamera,
  listCameras,
} from "@/lib/cameras";
import type { CameraRecord } from "@/lib/cameras";
import { fetchWeatherSnapshot, scoreCameraWeather } from "@/lib/weather";
import type { CameraEvaluation } from "@/lib/weather";
import { isCameraAvailable } from "@/lib/availability";

export async function GET(request: NextRequest) {
  try {
    const now = new Date();
    const cameraId = request.nextUrl.searchParams.get("cameraId");
    const excludeParam = request.nextUrl.searchParams.get("exclude") ?? "";
    const excludeSet = new Set(
      excludeParam
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    );

    if (cameraId) {
      const camera = await getCameraById(cameraId);
      if (!camera) {
        return NextResponse.json(
          { error: "Camera not found" },
          { status: 404 }
        );
      }
      const entry = await buildCameraEntry(camera, now);
      return NextResponse.json({
        camera,
        meta: entry ? buildMeta(entry) : null,
        rotationReset: false,
      });
    }

    const best = await findBestCamera(excludeSet, now);
    if (!best) {
      return NextResponse.json(
        { error: "No cameras available" },
        { status: 404 }
      );
    }

    return NextResponse.json(best);
  } catch (error) {
    console.error("[api/best-camera] error:", error);
    return NextResponse.json(
      { error: "Failed to calculate best camera" },
      { status: 500 }
    );
  }
}

const CAMERA_FETCH_BATCH = 5;

async function findBestCamera(exclude: Set<string>, now: Date) {
  const candidates: CameraEntry[] = [];
  let offset = 0;

  while (true) {
    const batch = await listCameras(CAMERA_FETCH_BATCH, offset);
    if (!batch.length) {
      break;
    }
    offset += batch.length;

    const results = await Promise.all(
      batch.map((camera) => buildCameraEntry(camera, now))
    );
    for (const entry of results) {
      if (entry) {
        candidates.push(entry);
      }
    }
  }

  const scored = candidates
    .filter((entry): entry is typeof entry => entry !== null)
    .sort((a, b) => {
      if (!a?.evaluation || !b?.evaluation) {
        return 0;
      }
      if (b.evaluation.score !== a.evaluation.score) {
        return b.evaluation.score - a.evaluation.score;
      }
      return (
        (a.evaluation.distanceMinutes ?? Infinity) -
        (b.evaluation.distanceMinutes ?? Infinity)
      );
    });

  if (scored.length === 0) {
    const fallback = await getRandomCamera();
    return fallback ? { camera: fallback, rotationReset: false } : null;
  }

  const candidate = scored.find(
    (entry) => entry && !exclude.has(entry.camera.id)
  );

  if (candidate) {
    return {
      camera: candidate.camera,
      meta: buildMeta(candidate),
      rotationReset: false,
    };
  }

  const best = scored[0];
  if (!best || best.evaluation.score <= 0) {
    const fallback = await getRandomCamera();
    return fallback
      ? { camera: fallback, rotationReset: true }
      : null;
  }

  return {
    camera: best.camera,
    meta: buildMeta(best),
    rotationReset: true,
  };
}

type CameraEntry = {
  camera: CameraRecord;
  evaluation: CameraEvaluation;
  weatherSnapshot: {
    sunrise?: string;
    sunset?: string;
    timezone?: string;
  };
};

async function buildCameraEntry(
  camera: CameraRecord,
  now: Date
): Promise<CameraEntry | null> {
  if (camera.lat === null || camera.lng === null) {
    return null;
  }
  if (camera.linkAvailable === false) {
    return null;
  }

  const availability = await isCameraAvailable(camera);
  if (!availability.available) {
    return null;
  }

  try {
    const weather = await fetchWeatherSnapshot(camera.lat, camera.lng, camera.id);
    const hasCitySkyline = camera.tags?.some((tag) =>
      tag.toLowerCase().includes("city skyline")
    );
    const evaluation = scoreCameraWeather(weather, now, { hasCitySkyline });
    return {
      camera,
      evaluation,
      weatherSnapshot: {
        sunrise: weather.daily?.sunrise?.[0],
        sunset: weather.daily?.sunset?.[0],
        timezone: weather.timezone,
      },
    };
  } catch (error) {
    console.warn(
      `[api/best-camera] weather failed for camera ${camera.id}`,
      error
    );
    return null;
  }
}

function buildMeta(entry: CameraEntry) {
  const events = formatUpcomingEvents(entry.evaluation);
  return {
    cameraId: entry.camera.id,
    score: entry.evaluation.score,
    label: entry.evaluation.label,
    isClear: entry.evaluation.isClear,
    distanceMinutes: entry.evaluation.distanceMinutes,
    weatherClass: entry.evaluation.weatherClass,
    timezone: entry.weatherSnapshot.timezone,
    sunrise: entry.weatherSnapshot.sunrise,
    sunset: entry.weatherSnapshot.sunset,
    nextEvent: events[0] ?? null,
    followingEvent: events[1] ?? null,
  };
}

function formatUpcomingEvents(evaluation: CameraEvaluation) {
  type EvaluationEvent = NonNullable<CameraEvaluation["nextEvent"]>;
  const events = [evaluation.nextEvent, evaluation.followingEvent].filter(
    Boolean
  ) as EvaluationEvent[];
  if (!events.length) {
    return [];
  }

  const now = Date.now();
  const sorted = events
    .map((event) => ({
      type: event.type,
      timestamp: event.time.getTime(),
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  const future = sorted.filter((event) => event.timestamp >= now);
  const ordered = future.length ? future : sorted;
  return ordered.map((event) => ({
    type: event.type,
    timeISO: new Date(event.timestamp).toISOString(),
  }));
}
