import { NextRequest, NextResponse } from "next/server";
import { listCameras } from "@/lib/cameras";
import { getCachedWeatherSnapshot } from "@/lib/weather";
import type { OpenMeteoResponse } from "@/lib/weather";
import type { CameraRecord } from "@/lib/cameras";

export const dynamic = "force-dynamic";

export type CameraWithWeather = {
  camera: CameraRecord;
  weather: OpenMeteoResponse | null;
};

export async function GET(request: NextRequest) {
  try {
    const limitParam = request.nextUrl.searchParams.get("limit");
    const offsetParam = request.nextUrl.searchParams.get("offset");
    const excludeParam = request.nextUrl.searchParams.get("exclude") ?? "";

    const limit = limitParam ? parseInt(limitParam, 10) : 200;
    const offset = offsetParam ? parseInt(offsetParam, 10) : 0;
    const excludeSet = new Set(
      excludeParam
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    );

    // Fetch cameras from database
    const allCameras = await listCameras(limit, offset);

    // Filter out excluded cameras and unavailable cameras
    const cameras = allCameras.filter(
      (camera) =>
        !excludeSet.has(camera.id) &&
        camera.linkAvailable !== false &&
        camera.lat !== null &&
        camera.lng !== null
    );

    // Fetch cached weather data for each camera
    const camerasWithWeather: CameraWithWeather[] = await Promise.all(
      cameras.map(async (camera) => {
        const weather = await getCachedWeatherSnapshot(camera.id);
        return {
          camera,
          weather,
        };
      })
    );

    return NextResponse.json({
      cameras: camerasWithWeather,
      count: camerasWithWeather.length,
    });
  } catch (error) {
    console.error("[api/cameras-with-weather] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch cameras with weather data" },
      { status: 500 }
    );
  }
}
