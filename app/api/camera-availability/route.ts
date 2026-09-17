import { NextRequest, NextResponse } from "next/server";
import { execute, fromBool, nowIso } from "@/lib/db";

// Called from a real browser request, so the request's own origin is always the
// correct base — no deployment URL needs to be configured anywhere.
async function triggerReplaceLink(origin: string, cronSecret?: string) {
  const headers: Record<string, string> = {};
  if (cronSecret) {
    headers["Authorization"] = `Bearer ${cronSecret}`;
  }
  return fetch(`${origin}/api/replace-link`, { headers });
}

export async function POST(request: NextRequest) {
  try {
    const { cameraId, available } = (await request.json()) as {
      cameraId?: string;
      available?: boolean;
    };

    if (!cameraId || typeof available !== "boolean") {
      return NextResponse.json(
        { error: "cameraId and available flag are required" },
        { status: 400 }
      );
    }

    await execute(
      `UPDATE camera_ytb SET link_available = ?, last_check = ? WHERE camera_id = ?`,
      fromBool(available),
      nowIso(),
      cameraId
    );

    // If marked unavailable, trigger link replacement chain in background
    if (!available) {
      triggerReplaceLink(
        request.nextUrl.origin,
        process.env.CRON_SECRET
      ).catch((err) =>
        console.warn("[camera-availability] failed to trigger replace-link", err)
      );
    }

    return NextResponse.json({ updated: true });
  } catch (error) {
    console.error("[api/camera-availability]", error);
    return NextResponse.json(
      { error: "Failed to update availability" },
      { status: 500 }
    );
  }
}
