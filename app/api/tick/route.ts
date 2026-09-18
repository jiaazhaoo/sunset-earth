import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { R2Bucket } from "@cloudflare/workers-types";
import { requireCronSecret } from "@/lib/auth";
import { execute, nowIso, query } from "@/lib/db";
import { sendPush, type SubscriptionRow } from "@/lib/push";

export const dynamic = "force-dynamic";

/** Reminder fires when the sunset is this far away. */
const REMIND_MIN = 15;
const REMIND_WINDOW_MIN = 10; // the cron runs every 10 min, so [15, 25) catches each sunset once
/** A camera's golden hour is worth keeping when it scores at least this. */
const HIGHLIGHT_MIN_SCORE = 88;

type LiveRow = {
  camera_id: string;
  placename: string | null;
  city: string | null;
  country: string | null;
  link: string | null;
  score: number;
  label: string | null;
  sunset: string | null;
};

/**
 * Every ten minutes, two small jobs on the current rankings:
 *   1. sunset reminders to browsers that asked for a camera;
 *   2. keep a frame of each camera's best golden hour for the gallery.
 */
export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  const live = await query<LiveRow>(
    `SELECT c.camera_id, c.placename, c.city, c.country, c.link, r.score, r.label, r.sunset
     FROM camera_rankings r JOIN camera_ytb c ON c.camera_id = r.camera_id
     WHERE r.available = 1 AND c.link_available = 1`
  );
  const now = Date.now();
  const byId = new Map(live.map((c) => [c.camera_id, c]));

  // --- 1. reminders -------------------------------------------------------
  const reminders = { sent: 0, gone: 0, failed: 0 };
  const dueSoon = live.filter((c) => {
    const min = c.sunset ? (Date.parse(c.sunset) - now) / 60_000 : NaN;
    return min >= REMIND_MIN && min < REMIND_MIN + REMIND_WINDOW_MIN;
  });
  if (dueSoon.length) {
    const subs = await query<SubscriptionRow>(`SELECT id, endpoint, p256dh, auth, camera_ids, failures FROM push_subscriptions`);
    for (const sub of subs) {
      const wanted = new Set(JSON.parse(sub.camera_ids) as string[]);
      for (const cam of dueSoon) {
        if (!wanted.has(cam.camera_id) || !cam.sunset) continue;
        const already = await query<{ id: number }>(
          `SELECT id FROM push_log WHERE subscription_id = ? AND camera_id = ? AND event_time = ?`,
          sub.id, cam.camera_id, cam.sunset
        );
        if (already.length) continue;
        const minutes = Math.round((Date.parse(cam.sunset) - now) / 60_000);
        const where = [cam.city, cam.country].filter(Boolean).join(", ");
        const result = await sendPush(sub, {
          title: `Sunset in ${minutes} min — ${cam.placename ?? where}`,
          body: where ? `${where}. Tap to watch live.` : "Tap to watch live.",
          url: `https://sunset-earth.com/?camera=${encodeURIComponent(cam.camera_id)}`,
          tag: `sunset-${cam.camera_id}`,
        });
        reminders[result]++;
        if (result === "sent") {
          await execute(
            `INSERT OR IGNORE INTO push_log (subscription_id, camera_id, event_time, sent_at) VALUES (?, ?, ?, ?)`,
            sub.id, cam.camera_id, cam.sunset, nowIso()
          );
        }
        if (result === "gone") break;
      }
    }
  }

  // --- 2. highlights ------------------------------------------------------
  const highlights = { kept: 0, skipped: 0 };
  const bucket = (getCloudflareContext().env as { HIGHLIGHTS?: R2Bucket }).HIGHLIGHTS;
  if (bucket) {
    const day = new Date(now).toISOString().slice(0, 10);
    const golden = live.filter((c) => c.score >= HIGHLIGHT_MIN_SCORE && /sunset|sunrise|blue-hour/.test(c.label ?? ""));
    for (const cam of golden) {
      const videoId = cam.link?.match(/[?&]v=([\w-]{11})/)?.[1];
      if (!videoId) continue;
      const have = await query<{ score: number }>(`SELECT score FROM highlights WHERE camera_id = ? AND day = ?`, cam.camera_id, day);
      if (have[0] && have[0].score >= cam.score) {
        highlights.skipped++;
        continue;
      }
      // YouTube refreshes a live stream's cover every few minutes; that frame
      // is the closest thing to a screenshot we can get without decoding video.
      const res = await fetch(`https://i.ytimg.com/vi/${videoId}/hqdefault_live.jpg`, { cache: "no-store" });
      if (!res.ok) {
        highlights.skipped++;
        continue;
      }
      const key = `${day}/${cam.camera_id}.jpg`;
      await bucket.put(key, await res.arrayBuffer(), { httpMetadata: { contentType: "image/jpeg" } });
      await execute(
        `INSERT INTO highlights (camera_id, day, r2_key, score, label, taken_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(camera_id, day) DO UPDATE SET r2_key = excluded.r2_key, score = excluded.score, label = excluded.label, taken_at = excluded.taken_at`,
        cam.camera_id, day, key, cam.score, cam.label, nowIso()
      );
      highlights.kept++;
    }
  }

  void byId;
  return NextResponse.json({ dueSoon: dueSoon.map((c) => c.camera_id), reminders, highlights });
}
