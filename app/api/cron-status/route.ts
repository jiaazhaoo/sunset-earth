import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Aggregate in SQL rather than fetching every row to count it.
    const cameraStats = await queryOne<{
      latest_check: string | null;
      total: number | null;
      available: number | null;
    }>(
      `SELECT
         MAX(last_check) AS latest_check,
         COUNT(*) AS total,
         SUM(CASE WHEN link_available != 0 THEN 1 ELSE 0 END) AS available
       FROM camera_ytb`
    );

    const rankingStats = await queryOne<{
      latest_computed_at: string | null;
      total: number | null;
      available: number | null;
    }>(
      `SELECT
         MAX(computed_at) AS latest_computed_at,
         COUNT(*) AS total,
         SUM(CASE WHEN available = 1 THEN 1 ELSE 0 END) AS available
       FROM camera_rankings`
    );

    const totalCameras = cameraStats?.total ?? 0;
    const availableCameras = cameraStats?.available ?? 0;
    const rankedCameras = rankingStats?.total ?? 0;
    const availableRanked = rankingStats?.available ?? 0;

    const now = new Date();
    const lastCameraCheck = cameraStats?.latest_check
      ? new Date(cameraStats.latest_check)
      : null;
    const lastRankingCompute = rankingStats?.latest_computed_at
      ? new Date(rankingStats.latest_computed_at)
      : null;

    // Calculate time since last run
    const minutesSinceLastCheck = lastCameraCheck
      ? Math.floor((now.getTime() - lastCameraCheck.getTime()) / 1000 / 60)
      : null;
    const minutesSinceLastRanking = lastRankingCompute
      ? Math.floor((now.getTime() - lastRankingCompute.getTime()) / 1000 / 60)
      : null;

    return NextResponse.json({
      status: "ok",
      timestamp: now.toISOString(),
      cronJobs: {
        refreshLinks: {
          schedule: "Every hour (0 * * * *)",
          lastRun: lastCameraCheck?.toISOString() ?? null,
          minutesSinceLastRun: minutesSinceLastCheck,
          isHealthy: minutesSinceLastCheck !== null && minutesSinceLastCheck < 120, // Should run within 2 hours
        },
        weatherCache: {
          schedule: "Every 3 hours (0 */3 * * *)",
          // Weather cache doesn't have a dedicated timestamp, estimate from rankings
          lastRun: lastRankingCompute?.toISOString() ?? null,
          minutesSinceLastRun: minutesSinceLastRanking,
          isHealthy:
            minutesSinceLastRanking !== null && minutesSinceLastRanking < 240, // Should run within 4 hours
        },
        computeRankings: {
          schedule: "Every 5 minutes (*/5 * * * *)",
          lastRun: lastRankingCompute?.toISOString() ?? null,
          minutesSinceLastRun: minutesSinceLastRanking,
          isHealthy:
            minutesSinceLastRanking !== null && minutesSinceLastRanking < 15, // Should run within 15 minutes
        },
      },
      cameras: {
        total: totalCameras,
        available: availableCameras,
        unavailable: totalCameras - availableCameras,
        availabilityRate:
          totalCameras > 0
            ? `${((availableCameras / totalCameras) * 100).toFixed(1)}%`
            : "n/a",
      },
      rankings: {
        total: rankedCameras,
        available: availableRanked,
        unavailable: rankedCameras - availableRanked,
      },
    });
  } catch (error) {
    console.error("[cron-status]", error);
    return NextResponse.json(
      {
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
