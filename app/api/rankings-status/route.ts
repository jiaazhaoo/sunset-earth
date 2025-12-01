import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Get all rankings with details
    const { data: rankings, error } = await supabaseAdmin
      .from("camera_rankings")
      .select("camera_id, score, label, available, computed_at")
      .order("computed_at", { ascending: false });

    if (error) {
      throw error;
    }

    // Group by status
    const available = rankings?.filter((r) => r.available) || [];
    const unavailable = rankings?.filter((r) => !r.available) || [];

    // Get score distribution
    const scoreRanges = {
      excellent: available.filter((r) => r.score >= 80).length,
      good: available.filter((r) => r.score >= 60 && r.score < 80).length,
      fair: available.filter((r) => r.score >= 40 && r.score < 60).length,
      poor: available.filter((r) => r.score < 40).length,
    };

    // Get latest update time
    const latestUpdate = rankings?.[0]?.computed_at
      ? new Date(rankings[0].computed_at)
      : null;
    const ageMinutes = latestUpdate
      ? Math.floor((Date.now() - latestUpdate.getTime()) / 1000 / 60)
      : null;

    return NextResponse.json({
      summary: {
        total: rankings?.length || 0,
        available: available.length,
        unavailable: unavailable.length,
        lastUpdate: latestUpdate?.toISOString() || null,
        ageMinutes,
      },
      scoreDistribution: scoreRanges,
      topCameras: available
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .map((r) => ({
          id: r.camera_id,
          score: r.score,
          label: r.label,
        })),
      unavailableCameras: unavailable.map((r) => ({
        id: r.camera_id,
        score: r.score,
        lastSeen: r.computed_at,
      })),
    });
  } catch (error) {
    console.error("[rankings-status]", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
