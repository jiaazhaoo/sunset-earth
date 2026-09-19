import { decode } from "jpeg-js";
import { execute, nowIso, query } from "@/lib/db";
import { frameStats, scoreFrame } from "@/lib/visual";

/**
 * Look at every camera's live thumbnail and record how it looks.
 *
 * YouTube serves `hqdefault_live.jpg` for a live stream: for most streams an
 * automatic frame that refreshes every few minutes, for others a card the
 * channel uploaded. The two are told apart the only reliable way — by
 * watching whether the bytes ever change. Until a thumbnail has changed at
 * least once, its score is stored but `live` stays 0 and nobody trusts it.
 */

export type VisualSummary = {
  checked: number;
  changed: number;
  live: number;
  failed: number;
};

type Prior = {
  camera_id: string;
  video_id: string | null;
  content_hash: string | null;
  checks: number;
  changes: number;
  live: number;
};

const CONCURRENCY = 8;
const FETCH_TIMEOUT_MS = 8_000;

export async function measureThumbnails(
  cameras: Array<{ cameraId: string; videoId: string | null }>
): Promise<VisualSummary> {
  const summary: VisualSummary = { checked: 0, changed: 0, live: 0, failed: 0 };
  const priors = new Map(
    (await query<Prior>(`SELECT camera_id, video_id, content_hash, checks, changes, live FROM camera_visual`)).map((p) => [
      String(p.camera_id),
      p,
    ])
  );

  const targets = cameras.filter((c) => c.videoId);
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((c) => measureOne(c.cameraId, c.videoId!, priors.get(c.cameraId))));
    for (const r of results) {
      summary.checked++;
      if (r === "failed") summary.failed++;
      else {
        if (r.changed) summary.changed++;
        if (r.live) summary.live++;
      }
    }
  }
  return summary;
}

async function measureOne(
  cameraId: string,
  videoId: string,
  previous: Prior | undefined
): Promise<{ changed: boolean; live: boolean } | "failed"> {
  const now = nowIso();
  // A replaced link is a new stream: its thumbnail history starts over.
  const prior = previous && previous.video_id === videoId ? previous : undefined;
  let bytes: ArrayBuffer;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(`https://i.ytimg.com/vi/${videoId}/hqdefault_live.jpg`, {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    if (!res.ok) return "failed";
    bytes = await res.arrayBuffer();
  } catch {
    return "failed";
  }

  const hash = await sha1(bytes);
  const changed = Boolean(prior?.content_hash) && prior!.content_hash !== hash;
  const checks = (prior?.checks ?? 0) + 1;
  const changes = (prior?.changes ?? 0) + (changed ? 1 : 0);
  const live = changed || Boolean(prior?.live);

  // Only spend the decode when the picture is new (or never scored).
  let scored: ReturnType<typeof scoreFrame> | null = null;
  if (changed || !prior?.content_hash) {
    try {
      const img = decode(new Uint8Array(bytes), { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 32 });
      scored = scoreFrame(frameStats(img.data, img.width, img.height));
    } catch (error) {
      console.warn("[visual] decode failed", cameraId, error instanceof Error ? error.message : error);
    }
  }

  await execute(
    `INSERT INTO camera_visual
       (camera_id, video_id, content_hash, changed_at, checks, changes, live,
        score, brightness, contrast, colorfulness, warm, sky, notes, measured_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(camera_id) DO UPDATE SET
       video_id = excluded.video_id,
       content_hash = excluded.content_hash,
       changed_at = CASE
         WHEN excluded.changed_at IS NOT NULL THEN excluded.changed_at
         WHEN camera_visual.video_id IS NOT excluded.video_id THEN NULL
         ELSE camera_visual.changed_at END,
       checks = excluded.checks,
       changes = excluded.changes,
       live = excluded.live,
       score = COALESCE(excluded.score, camera_visual.score),
       brightness = COALESCE(excluded.brightness, camera_visual.brightness),
       contrast = COALESCE(excluded.contrast, camera_visual.contrast),
       colorfulness = COALESCE(excluded.colorfulness, camera_visual.colorfulness),
       warm = COALESCE(excluded.warm, camera_visual.warm),
       sky = COALESCE(excluded.sky, camera_visual.sky),
       notes = COALESCE(excluded.notes, camera_visual.notes),
       measured_at = excluded.measured_at`,
    cameraId,
    videoId,
    hash,
    changed ? now : null,
    checks,
    changes,
    live ? 1 : 0,
    scored?.score ?? null,
    scored?.brightness ?? null,
    scored?.contrast ?? null,
    scored?.colorfulness ?? null,
    scored?.warm ?? null,
    scored?.sky ?? null,
    scored ? scored.notes.join(", ") : null,
    now
  );
  return { changed, live };
}

async function sha1(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
