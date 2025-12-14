import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Get latest camera check time
    const { data: latestCamera } = await supabaseAdmin
      .from("camera_ytb")
      .select("last_check")
      .order("last_check", { ascending: false })
      .limit(1)
      .single();

    // Get latest ranking computation time
    const { data: latestRanking } = await supabaseAdmin
      .from("camera_rankings")
      .select("computed_at")
      .order("computed_at", { ascending: false })
      .limit(1)
      .single();

    // Get camera stats
    const { data: cameraStats } = await supabaseAdmin
      .from("camera_ytb")
      .select("link_available");

    const totalCameras = cameraStats?.length ?? 0;
    const availableCameras =
      cameraStats?.filter((c) => c.link_available !== false).length ?? 0;

    // Get ranking stats
    const { data: rankingStats } = await supabaseAdmin
      .from("camera_rankings")
      .select("available, score");

    const rankedCameras = rankingStats?.length ?? 0;
    const availableRanked =
      rankingStats?.filter((r) => r.available).length ?? 0;

    const now = new Date();
    const lastCameraCheck = latestCamera?.last_check
      ? new Date(latestCamera.last_check)
      : null;
    const lastRankingCompute = latestRanking?.computed_at
      ? new Date(latestRanking.computed_at)
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
        availabilityRate: `${((availableCameras / totalCameras) * 100).toFixed(1)}%`,
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
