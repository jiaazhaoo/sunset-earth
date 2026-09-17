import { NextResponse } from "next/server";

/**
 * Guard for cron and admin routes. Returns a 401 response to send back, or
 * null when the request carries `Authorization: Bearer <CRON_SECRET>`.
 *
 * Fails closed: with no CRON_SECRET configured every call is rejected, so a
 * misconfigured deployment cannot expose the batch routes by accident.
 */
export function requireCronSecret(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[auth] CRON_SECRET is not configured; rejecting request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const auth = request.headers.get("Authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

/**
 * Whether the /dev pages and /api/dev routes should exist at all. They probe
 * arbitrary URLs and run ad-hoc scoring, so they are off in production unless
 * ENABLE_DEV_ROUTES=1 is set in wrangler.jsonc `vars`.
 */
export function devToolsEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.ENABLE_DEV_ROUTES === "1"
  );
}

/** 404 body for disabled dev routes, indistinguishable from a missing route. */
export function devToolsDisabledResponse(): NextResponse {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
