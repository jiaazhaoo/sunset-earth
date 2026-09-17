import { NextRequest, NextResponse } from "next/server";
import { getCameraById } from "@/lib/cameras";
import { isCameraAvailable } from "@/lib/availability";
import { execute, fromBool, nowIso } from "@/lib/db";

// Browsers report playback failures here. A single client's failure is weak
// evidence (autoplay policy, extensions, slow networks and embed restrictions
// all look the same from the player), so the report is treated as a hint: the
// camera is re-checked server-side and only demoted if that check fails too.
// Nothing is ever promoted from this endpoint, and it no longer fans out to
// replace-link — the hourly cron picks up demoted cameras on its own.

// Ignore reports for a camera that was checked recently, so a burst of viewers
// hitting the same broken stream costs one YouTube probe, not one per viewer.
const RECHECK_COOLDOWN_MS = 10 * 60 * 1000;

// YouTube IFrame API error codes worth acting on. 150/101 (embedding disabled
// by the owner) and 100 (video removed/private) mean the link is bad for every
// viewer; 2 (invalid id) is a data problem; 5 is an HTML5 player glitch.
const REPORTABLE_ERRORS = new Set([2, 100, 101, 150]);

export async function POST(request: NextRequest) {
  try {
    const { cameraId, errorCode } = (await request.json()) as {
      cameraId?: string;
      errorCode?: number;
    };

    if (!cameraId || typeof cameraId !== "string") {
      return NextResponse.json(
        { error: "cameraId is required" },
        { status: 400 }
      );
    }

    const camera = await getCameraById(cameraId);
    if (!camera) {
      return NextResponse.json({ error: "Camera not found" }, { status: 404 });
    }

    if (camera.linkAvailable === false) {
      return NextResponse.json({ updated: false, reason: "already-unavailable" });
    }

    // Player timeouts (no errorCode) are almost always the viewer's environment.
    if (typeof errorCode !== "number" || !REPORTABLE_ERRORS.has(errorCode)) {
      return NextResponse.json({ updated: false, reason: "ignored" });
    }

    const lastCheck = camera.lastCheck ? Date.parse(camera.lastCheck) : NaN;
    if (Number.isFinite(lastCheck) && Date.now() - lastCheck < RECHECK_COOLDOWN_MS) {
      return NextResponse.json({ updated: false, reason: "cooldown" });
    }

    const verdict = await isCameraAvailable(camera);
    // Record the check either way so repeated reports hit the cooldown.
    await execute(
      `UPDATE camera_ytb SET link_available = ?, last_check = ? WHERE camera_id = ?`,
      fromBool(verdict.available),
      nowIso(),
      cameraId
    );

    if (verdict.available) {
      return NextResponse.json({ updated: false, reason: "verified-ok" });
    }
    console.log("[camera-availability] demoted", cameraId, {
      errorCode,
      reason: verdict.reason,
    });
    return NextResponse.json({ updated: true, reason: verdict.reason });
  } catch (error) {
    console.error("[api/camera-availability]", error);
    return NextResponse.json(
      { error: "Failed to update availability" },
      { status: 500 }
    );
  }
}
