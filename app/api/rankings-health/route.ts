import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    // Get freshness stats
    const { data: stats, error: statsError } = await supabaseAdmin
      .from("camera_rankings")
      .select("computed_at, available")
      .order("computed_at", { ascending: false })
      .limit(1);

    if (statsError) {
      throw statsError;
    }

    const latestUpdate = stats?.[0]?.computed_at
      ? new Date(stats[0].computed_at)
      : null;
    const ageMinutes = latestUpdate
      ? Math.floor((Date.now() - latestUpdate.getTime()) / 1000 / 60)
      : null;

    // Count available cameras
    const { count: availableCount, error: countError } = await supabaseAdmin
      .from("camera_rankings")
      .select("*", { count: "exact", head: true })
      .eq("available", true);

    if (countError) {
      throw countError;
    }

    // Count fresh data (within 24 hours)
    const freshnessThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const { count: freshCount, error: freshError } = await supabaseAdmin
      .from("camera_rankings")
      .select("*", { count: "exact", head: true })
      .eq("available", true)
      .gte("computed_at", freshnessThreshold.toISOString());

    if (freshError) {
      throw freshError;
    }

    // Calculate average score
    const { data: avgData, error: avgError } = await supabaseAdmin.rpc(
      "get_avg_score",
      {}
    );

    const health = {
      status:
        ageMinutes !== null && ageMinutes < 60
          ? "healthy"
          : ageMinutes !== null && ageMinutes < 120
            ? "degraded"
            : "unhealthy",
      latestUpdate: latestUpdate?.toISOString() ?? null,
      ageMinutes,
      availableCameras: availableCount ?? 0,
      freshCameras: freshCount ?? 0,
      freshnessPercentage:
        availableCount && freshCount
          ? Math.round((freshCount / availableCount) * 100)
          : 0,
      averageScore: avgData ?? null,
    };

    return NextResponse.json(health);
  } catch (error) {
    console.error("[rankings-health]", error);
    return NextResponse.json(
      {
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
