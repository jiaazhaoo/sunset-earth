import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

async function triggerReplaceLink(origin: string, cronSecret?: string, bypassSecret?: string) {
  const url = buildBypassUrl(`${origin}/api/replace-link`, bypassSecret);
  const headers: Record<string, string> = {};
  if (cronSecret) {
    headers["Authorization"] = `Bearer ${cronSecret}`;
  }
  const bypassHeader = buildBypassHeader(bypassSecret);
  if (bypassHeader) {
    headers["x-vercel-protection-bypass"] = bypassHeader;
  }
  return fetch(url, { headers });
}

function buildBypassUrl(url: string, bypassSecret?: string) {
  if (!bypassSecret) return url;
  const parsed = new URL(url);
  parsed.searchParams.set("x-vercel-set-bypass-cookie", "true");
  parsed.searchParams.set("x-vercel-protection-bypass", bypassSecret);
  return parsed.toString();
}

function buildBypassHeader(bypassSecret?: string) {
  if (!bypassSecret) return null;
  return bypassSecret;
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

    const { error } = await supabaseAdmin
      .from("camera_ytb")
      .update({
        link_available: available,
        last_check: new Date().toISOString(),
      })
      .eq("camera_id", cameraId);

    if (error) {
      throw new Error(error.message);
    }

    // If marked unavailable, trigger link replacement chain in background
    if (!available) {
      triggerReplaceLink(
        request.nextUrl.origin,
        process.env.CRON_SECRET,
        process.env.VERCEL_AUTOMATION_BYPASS_SECRET
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
