import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/auth";
import { runDiscovery } from "@/lib/discovery";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Weekly (Mon 03:00 UTC) via Cron Trigger, or by hand:
 *   ?dry=1        analyse and report, write nothing
 *   ?limit=N      cap new streams analysed this run (default 60)
 *   ?nosearch=1   crawl trusted channels only
 */
export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  const p = request.nextUrl.searchParams;
  try {
    const summary = await runDiscovery({
      dryRun: p.get("dry") === "1",
      noSearch: p.get("nosearch") === "1",
      maxNew: p.get("limit") ? Number(p.get("limit")) : undefined,
    });
    return NextResponse.json(summary);
  } catch (error) {
    console.error("[discover]", error);
    return NextResponse.json({ error: "Discovery failed" }, { status: 500 });
  }
}
