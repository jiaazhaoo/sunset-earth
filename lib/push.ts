import { buildPushPayload, type PushSubscription, type VapidKeys } from "@block65/webcrypto-web-push";
import { execute, nowIso, query } from "@/lib/db";

/**
 * Web Push reminders: "Sunset in 15 minutes — Kawazu". Subscriptions live in
 * push_subscriptions with the camera ids they asked about; push_log stops the
 * same event being sent twice. Encryption and VAPID via WebCrypto so it runs
 * on Workers.
 */

export type SubscriptionRow = {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  camera_ids: string;
  failures: number;
};

function vapid(): VapidKeys | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  return { subject: "https://sunset-earth.com", publicKey, privateKey };
}

export function pushConfigured(): boolean {
  return vapid() !== null;
}

export async function saveSubscription(sub: PushSubscription, cameraIds: string[]): Promise<void> {
  const existing = await query<{ id: number; camera_ids: string }>(
    `SELECT id, camera_ids FROM push_subscriptions WHERE endpoint = ?`,
    sub.endpoint
  );
  const merged = [...new Set([...(existing[0] ? (JSON.parse(existing[0].camera_ids) as string[]) : []), ...cameraIds])];
  if (existing[0]) {
    await execute(
      `UPDATE push_subscriptions SET p256dh = ?, auth = ?, camera_ids = ?, failures = 0 WHERE id = ?`,
      sub.keys.p256dh, sub.keys.auth, JSON.stringify(merged), existing[0].id
    );
  } else {
    await execute(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth, camera_ids, created_at) VALUES (?, ?, ?, ?, ?)`,
      sub.endpoint, sub.keys.p256dh, sub.keys.auth, JSON.stringify(merged), nowIso()
    );
  }
}

export async function forgetCamera(endpoint: string, cameraId: string): Promise<void> {
  const row = (await query<{ id: number; camera_ids: string }>(
    `SELECT id, camera_ids FROM push_subscriptions WHERE endpoint = ?`, endpoint
  ))[0];
  if (!row) return;
  const left = (JSON.parse(row.camera_ids) as string[]).filter((c) => c !== cameraId);
  if (left.length) await execute(`UPDATE push_subscriptions SET camera_ids = ? WHERE id = ?`, JSON.stringify(left), row.id);
  else await execute(`DELETE FROM push_subscriptions WHERE id = ?`, row.id);
}

export async function subscribedCameras(endpoint: string): Promise<string[]> {
  const row = (await query<{ camera_ids: string }>(`SELECT camera_ids FROM push_subscriptions WHERE endpoint = ?`, endpoint))[0];
  return row ? (JSON.parse(row.camera_ids) as string[]) : [];
}

/** Send one notification; drops the subscription after repeated hard failures. */
export async function sendPush(
  row: SubscriptionRow,
  message: { title: string; body: string; url: string; tag: string }
): Promise<"sent" | "gone" | "failed"> {
  const keys = vapid();
  if (!keys) return "failed";
  const subscription: PushSubscription = {
    endpoint: row.endpoint,
    expirationTime: null,
    keys: { p256dh: row.p256dh, auth: row.auth },
  };
  try {
    const payload = await buildPushPayload({ data: JSON.stringify(message), options: { ttl: 20 * 60 } }, subscription, keys);
    const res = await fetch(row.endpoint, payload);
    if (res.status === 404 || res.status === 410) {
      await execute(`DELETE FROM push_subscriptions WHERE id = ?`, row.id);
      return "gone";
    }
    if (!res.ok) throw new Error(`push service ${res.status}`);
    await execute(`UPDATE push_subscriptions SET last_sent_at = ?, failures = 0 WHERE id = ?`, nowIso(), row.id);
    return "sent";
  } catch (error) {
    console.warn("[push] failed", row.id, error instanceof Error ? error.message : error);
    const failures = row.failures + 1;
    if (failures >= 5) await execute(`DELETE FROM push_subscriptions WHERE id = ?`, row.id);
    else await execute(`UPDATE push_subscriptions SET failures = ? WHERE id = ?`, failures, row.id);
    return "failed";
  }
}
