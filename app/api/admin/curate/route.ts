import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { nowIso } from "@/lib/db";
import { listCurateRows, setCuratedRating } from "@/lib/curate";

export const dynamic = "force-dynamic";

/** GET → every camera on air with its picture, stream and viewer numbers. */
export async function GET(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ cameras: await listCurateRows(), at: nowIso() });
}

/** POST {cameraId, rating: 1..5 | null} */
export async function POST(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as { cameraId?: unknown; rating?: unknown };
  const cameraId = typeof body.cameraId === "string" ? body.cameraId : null;
  const rating =
    body.rating === null || body.rating === undefined
      ? null
      : Number.isInteger(body.rating) && (body.rating as number) >= 1 && (body.rating as number) <= 5
        ? (body.rating as number)
        : undefined;
  if (!cameraId || rating === undefined) {
    return NextResponse.json({ error: "cameraId and a rating of 1..5 (or null) are required" }, { status: 400 });
  }
  const ok = await setCuratedRating(cameraId, rating);
  return ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "Not found" }, { status: 404 });
}
