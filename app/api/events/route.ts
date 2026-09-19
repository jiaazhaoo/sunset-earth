import { NextRequest, NextResponse } from "next/server";
import { execute, nowIso, queryOne } from "@/lib/db";
import { phaseOf } from "@/lib/quality";

export const dynamic = "force-dynamic";

const COLUMNS = { skip: "skips", dwell: "dwells", fav: "favs", unfav: "favs" } as const;
type EventName = keyof typeof COLUMNS;

/**
 * Implicit feedback from the player: the viewer left within seconds, stayed
 * for minutes, or saved the camera. Counts only — no identifiers, nothing per
 * viewer. The browser says what happened; the server decides what it means:
 * the phase comes from the camera's current ranking label, never from the
 * client. See components/use-view-feedback.ts and lib/quality.ts.
 */
export async function POST(request: NextRequest) {
  // First-party pages only. Browsers send Sec-Fetch-Site on every request,
  // sendBeacon included; a foreign Origin is refused as well.
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const origin = request.headers.get("origin");
  if (origin) {
    let host: string | null = null;
    try {
      host = new URL(origin).host;
    } catch {}
    if (host !== request.nextUrl.host) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const raw = await request.text();
  if (raw.length > 200) {
    return NextResponse.json({ error: "Too large" }, { status: 413 });
  }
  let body: { cameraId?: unknown; event?: unknown } = {};
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  const cameraId =
    typeof body.cameraId === "string" && /^[\w-]{1,32}$/.test(body.cameraId) ? body.cameraId : null;
  const event =
    typeof body.event === "string" && body.event in COLUMNS ? (body.event as EventName) : null;
  if (!cameraId || !event) {
    return NextResponse.json({ error: "cameraId and event are required" }, { status: 400 });
  }

  const ranking = await queryOne<{ label: string | null }>(
    `SELECT label FROM camera_rankings WHERE camera_id = ?`,
    cameraId
  );
  if (!ranking) {
    return NextResponse.json({ error: "Unknown camera" }, { status: 404 });
  }

  const column = COLUMNS[event];
  const delta = event === "unfav" ? -1 : 1;
  await execute(
    `INSERT INTO camera_feedback (camera_id, phase, ${column}, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(camera_id, phase) DO UPDATE SET
       ${column} = MAX(0, camera_feedback.${column} + ?),
       updated_at = excluded.updated_at`,
    cameraId,
    phaseOf(ranking.label),
    Math.max(0, delta),
    nowIso(),
    delta
  );
  return NextResponse.json({ ok: true });
}
