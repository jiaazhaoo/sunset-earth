import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const freshnessThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // One aggregate replaces what used to be three count/stat queries plus the
    // Postgres `get_avg_score()` stored function (whose definition never lived
    // in this repo; averaging the available cameras' scores matches how the
    // value is presented below).
    const stats = await queryOne<{
      latest_computed_at: string | null;
      available_count: number | null;
      fresh_count: number | null;
      average_score: number | null;
    }>(
      `SELECT
         MAX(computed_at) AS latest_computed_at,
         SUM(CASE WHEN available = 1 THEN 1 ELSE 0 END) AS available_count,
         SUM(CASE WHEN available = 1 AND computed_at >= ? THEN 1 ELSE 0 END) AS fresh_count,
         AVG(CASE WHEN available = 1 THEN score END) AS average_score
       FROM camera_rankings`,
      freshnessThreshold.toISOString()
    );

    const latestUpdate = stats?.latest_computed_at
      ? new Date(stats.latest_computed_at)
      : null;
    const ageMinutes = latestUpdate
      ? Math.floor((Date.now() - latestUpdate.getTime()) / 1000 / 60)
      : null;

    const availableCount = stats?.available_count ?? 0;
    const freshCount = stats?.fresh_count ?? 0;
    const avgData = stats?.average_score ?? null;

    const health = {
      status:
        ageMinutes !== null && ageMinutes < 60
          ? "healthy"
          : ageMinutes !== null && ageMinutes < 120
            ? "degraded"
            : "unhealthy",
      latestUpdate: latestUpdate?.toISOString() ?? null,
      ageMinutes,
      availableCameras: availableCount,
      freshCameras: freshCount,
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
