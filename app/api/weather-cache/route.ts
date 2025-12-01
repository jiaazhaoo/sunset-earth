import { NextRequest, NextResponse } from "next/server";
import { listCameras } from "@/lib/cameras";
import { fetchWeatherSnapshot } from "@/lib/weather";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const BATCH_SIZE = 200;

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

    let offset = 0;
    const summary = {
      processed: 0,
      skipped: 0,
      updated: 0,
      errors: 0,
      details: [] as Array<{
        id: string;
        status: "updated" | "skipped" | "error";
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
        if (camera.lat === null || camera.lng === null) {
          summary.skipped++;
          summary.details.push({
            id: camera.id,
            status: "skipped",
            reason: "missing-coordinates",
          });
          continue;
        }
        summary.processed++;
        try {
          await fetchWeatherSnapshot(camera.lat, camera.lng, camera.id);
          summary.updated++;
          summary.details.push({
            id: camera.id,
            status: "updated",
          });
        } catch (error) {
          summary.errors++;
          summary.details.push({
            id: camera.id,
            status: "error",
            reason:
              error instanceof Error ? error.message : "unknown-error",
          });
          console.warn(
            "[weather-cache] failed to refresh",
            camera.id,
            error
          );
        }
      }
    }

    const result = {
      ...summary,
      chainStatus: {
        weatherCache: "success",
        computeRankings: "pending",
      },
    };

    // Trigger next task in chain: compute-rankings
    try {
      const baseUrl = request.nextUrl.origin;
      console.log("[weather-cache] triggering compute-rankings...");
      const rankingsResponse = await fetch(`${baseUrl}/api/compute-rankings`, {
        headers: {
          Authorization: `Bearer ${process.env.CRON_SECRET}`,
        },
      });

      if (!rankingsResponse.ok) {
        const errorText = await rankingsResponse.text();
        console.error(
          "[weather-cache] compute-rankings failed:",
          rankingsResponse.status,
          errorText
        );
        result.chainStatus.computeRankings = "failed";
        return NextResponse.json(result, { status: 207 });
      }

      result.chainStatus.computeRankings = "triggered";
      console.log("[weather-cache] successfully triggered compute-rankings");
    } catch (error) {
      console.error(
        "[weather-cache] failed to trigger compute-rankings:",
        error
      );
      result.chainStatus.computeRankings = "failed";
      return NextResponse.json(result, { status: 207 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[weather-cache]", error);
    return NextResponse.json(
      { error: "Failed to refresh weather cache" },
      { status: 500 }
    );
  }
}
