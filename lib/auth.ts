import { NextResponse } from "next/server";
import { cookies } from "next/headers";

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

/** Cookie that carries the admin session for /admin pages and /api/admin. */
export const ADMIN_COOKIE = "sunset_admin";

/**
 * Constant-time-ish comparison of the presented token with CRON_SECRET. The
 * admin surface is one person's review page, so the cron secret doubles as
 * its password; keep it long and random.
 */
export function isAdminToken(token: string | null | undefined): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !token || token.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i++) diff |= secret.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

/** Admin access via the session cookie or a bearer token (for curl). */
export async function isAdminRequest(request: Request): Promise<boolean> {
  const auth = request.headers.get("Authorization");
  if (auth?.startsWith("Bearer ") && isAdminToken(auth.slice(7))) return true;
  const jar = await cookies();
  return isAdminToken(jar.get(ADMIN_COOKIE)?.value);
}

export async function isAdminSession(): Promise<boolean> {
  const jar = await cookies();
  return isAdminToken(jar.get(ADMIN_COOKIE)?.value);
}
