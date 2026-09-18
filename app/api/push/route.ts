import { NextRequest, NextResponse } from "next/server";
import type { PushSubscription } from "@block65/webcrypto-web-push";
import { forgetCamera, pushConfigured, saveSubscription, subscribedCameras } from "@/lib/push";

export const dynamic = "force-dynamic";

/**
 * POST   { subscription, cameraId }  → remind me before this camera's sunset
 * DELETE { endpoint, cameraId }      → stop
 * GET    ?endpoint=…                 → which cameras this browser follows
 */
export async function POST(request: NextRequest) {
  if (!pushConfigured()) return NextResponse.json({ error: "Push not configured" }, { status: 503 });
  const body = (await request.json().catch(() => null)) as { subscription?: PushSubscription; cameraId?: string } | null;
  const sub = body?.subscription;
  if (!sub?.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys?.auth || !body?.cameraId) {
    return NextResponse.json({ error: "subscription and cameraId are required" }, { status: 400 });
  }
  await saveSubscription(sub, [body.cameraId]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { endpoint?: string; cameraId?: string } | null;
  if (!body?.endpoint || !body.cameraId) {
    return NextResponse.json({ error: "endpoint and cameraId are required" }, { status: 400 });
  }
  await forgetCamera(body.endpoint, body.cameraId);
  return NextResponse.json({ ok: true });
}

export async function GET(request: NextRequest) {
  const endpoint = request.nextUrl.searchParams.get("endpoint");
  if (!endpoint) return NextResponse.json({ cameraIds: [] });
  return NextResponse.json({ cameraIds: await subscribedCameras(endpoint) });
}
