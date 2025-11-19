import { NextRequest, NextResponse } from "next/server";
import {
  getCameraById,
  getRandomCamera,
  listCameras,
  type CameraRecord,
} from "@/lib/cameras";
import { fetchWeatherSnapshot, scoreCameraWeather } from "@/lib/weather";
import { isCameraAvailable } from "@/lib/availability";

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

    if (cameraId) {
      const camera = await getCameraById(cameraId);
      if (!camera) {
        return NextResponse.json(
          { error: "Camera not found" },
          { status: 404 }
        );
      }
      return NextResponse.json({ camera, rotationReset: false });
    }

    const best = await findBestCamera(excludeSet);
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

async function findBestCamera(exclude: Set<string>) {
  const now = new Date();
  const cameras = await listCameras(120);
  const candidates = await Promise.all(
    cameras.map(async (camera) => {
      if (camera.lat === null || camera.lng === null) {
        return null;
      }

      if (camera.linkAvailable === false) {
        return null;
      }

      const playable = await isCameraAvailable(camera);
      if (!playable) {
        return null;
      }

      try {
        const weather = await fetchWeatherSnapshot(camera.lat, camera.lng);
        let evaluation = scoreCameraWeather(weather, now);
        const hasCitySkyline = camera.tags?.some((tag) =>
          tag.toLowerCase().includes("city skyline")
        );
        if (
          hasCitySkyline &&
          (evaluation.score <= 40 ||
            !evaluation.label ||
            evaluation.label === "clear")
        ) {
          evaluation = {
            ...evaluation,
            score: 50,
            label: "city-skyline",
          };
        }

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
    })
  );

  const scored = candidates
    .filter(
      (entry): entry is {
        camera: CameraRecord;
        evaluation: ReturnType<typeof scoreCameraWeather>;
        weatherSnapshot: {
          sunrise: string | undefined;
          sunset: string | undefined;
          timezone: string | undefined;
        };
      } => entry !== null
    )
    .sort((a, b) => {
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
    (entry) => !exclude.has(entry.camera.id)
  );

  if (candidate) {
    return {
      camera: candidate.camera,
      meta: {
        label: candidate.evaluation.label,
        isClear: candidate.evaluation.isClear,
        distanceMinutes: candidate.evaluation.distanceMinutes,
        timezone: candidate.weatherSnapshot.timezone,
        sunrise: candidate.weatherSnapshot.sunrise,
        sunset: candidate.weatherSnapshot.sunset,
      },
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
    meta: {
      label: best.evaluation.label,
      isClear: best.evaluation.isClear,
      distanceMinutes: best.evaluation.distanceMinutes,
      timezone: best.weatherSnapshot.timezone,
      sunrise: best.weatherSnapshot.sunrise,
      sunset: best.weatherSnapshot.sunset,
    },
    rotationReset: true,
  };
}
