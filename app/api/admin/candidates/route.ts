import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { query } from "@/lib/db";
import { approveCandidate, rejectCandidate, type CandidateRow } from "@/lib/discovery";

export const dynamic = "force-dynamic";

/** GET ?status=pending|approved|rejected (default pending) → candidates. */
export async function GET(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const status = request.nextUrl.searchParams.get("status") ?? "pending";
  if (!["pending", "approved", "rejected"].includes(status)) {
    return NextResponse.json({ error: "Bad status" }, { status: 400 });
  }
  const rows = await query<CandidateRow>(
    `SELECT * FROM camera_candidates WHERE status = ? ORDER BY confidence DESC, discovered_at DESC LIMIT 200`,
    status
  );
  return NextResponse.json({ candidates: rows });
}

/** POST {id, action: "approve" | "reject", reason?} */
export async function POST(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    id?: number;
    action?: string;
    reason?: string;
  };
  if (typeof body.id !== "number") {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  if (body.action === "approve") {
    const cameraId = await approveCandidate(body.id, "admin");
    return cameraId
      ? NextResponse.json({ ok: true, cameraId })
      : NextResponse.json({ error: "Candidate cannot be approved (no location or already decided)" }, { status: 409 });
  }
  if (body.action === "reject") {
    const ok = await rejectCandidate(body.id, body.reason ?? "admin");
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ error: "action must be approve or reject" }, { status: 400 });
}
