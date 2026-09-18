import { isCameraAvailable } from "@/lib/availability";
import { buildCameraStub } from "@/lib/cameras";
import { execute, query, queryOne, nowIso, parseJson } from "@/lib/db";
import { distanceKm, locateCandidate, type GeocodeHit } from "@/lib/geocode";
import { analyzeStreamTitle, llmConfigured, type StreamAnalysis } from "@/lib/llm";
import { analyzeTitleByRules } from "@/lib/place-rules";
import {
  calculatePlaceMatch,
  fetchChannelLiveCandidates,
  looksLikeBroadcast,
  searchLiveVideos,
  type LiveVideoInfo,
} from "@/lib/youtube";
import type { CameraMetadata } from "@/lib/camera-metadata-types";

/**
 * Weekly discovery: find live streams we do not have yet, work out where
 * they are, and either adopt them as cameras or queue them for review.
 *
 *   gather   → every live stream on the channels we already trust, plus a
 *              rotating slice of site-wide searches
 *   analyse  → playable + embeddable?  →  rule engine reads the title with
 *              the geocoder as lie detector (lib/place-rules.ts); if that is
 *              not confident and a model key exists, Claude reads it  →
 *              duplicate check
 *   decide   → auto-approve (row in camera_ytb) / pending / rejected
 *
 * Every step is idempotent on video_id, so re-runs and partial runs are safe.
 */

/** Adopt without review at or above this confidence (host-channel streams). */
export const AUTO_APPROVE_CHANNEL = 0.8;
/** Search results come from unknown channels: a higher bar. */
export const AUTO_APPROVE_SEARCH = 0.9;
/** Below this the location is guesswork — reject outright. */
export const MIN_CONFIDENCE = 0.5;
/** A candidate this close to an existing camera of the same place is a duplicate view. */
export const DUPLICATE_KM = 2;
/** Cameras down this long leave the hourly repair queue. */
export const RETIRE_AFTER_DAYS = 30;

// Rotated weekly so each run spends its search budget on a different slice.
const SEARCH_QUERIES = [
  "sunset live cam 4k", "sunrise live camera", "beach live cam", "harbor live webcam",
  "city skyline live cam", "mountain live webcam", "lake live cam", "coastal live camera",
  "lighthouse live cam", "old town square live webcam", "volcano live cam", "aurora live cam",
  "live webcam Italy", "live webcam Japan", "live cam Norway", "live cam Australia beach",
  "live cam Greece island", "live webcam Switzerland alps", "live cam Hawaii", "live cam Iceland",
  "live cam Portugal", "live cam Spain beach", "live cam Canada mountains", "live cam New Zealand",
];
const SEARCHES_PER_RUN = 6;

export type CandidateStatus = "pending" | "approved" | "rejected";

export type CandidateRow = {
  id: number;
  video_id: string;
  title: string;
  channel_url: string | null;
  source: "channel" | "search";
  discovered_at: string;
  status: CandidateStatus;
  decided_by: "auto" | "admin" | null;
  reject_reason: string | null;
  placename: string | null;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  tag: string | null;
  camera_metadata: string | null;
  confidence: number | null;
  analysis: string | null;
  camera_id: string | null;
  decided_at: string | null;
};

export type DiscoverySummary = {
  channelsCrawled: number;
  searchesRun: number;
  seen: number;
  newCandidates: number;
  analysed: number;
  approved: number;
  /** Down cameras brought back with a discovered stream. */
  repaired: number;
  pending: number;
  rejected: Record<string, number>;
  retired: number;
  /** Whether Claude was available; without it nothing is auto-approved. */
  llm: boolean;
  details: Array<{ videoId: string; title: string; outcome: string; placename?: string }>;
};

export type DiscoveryOptions = {
  /** Stop after analysing this many new streams (subrequest budget, ~8 each). */
  maxNew?: number;
  /** Skip site-wide search, crawl known channels only. */
  noSearch?: boolean;
  /** Analyse and report but write nothing. */
  dryRun?: boolean;
};

export async function runDiscovery(options: DiscoveryOptions = {}): Promise<DiscoverySummary> {
  const maxNew = options.maxNew ?? 40;
  const summary: DiscoverySummary = {
    channelsCrawled: 0, searchesRun: 0, seen: 0, newCandidates: 0, analysed: 0,
    approved: 0, repaired: 0, pending: 0, rejected: {}, retired: 0, llm: llmConfigured(), details: [],
  };

  // --- gather -------------------------------------------------------------
  const known = await knownVideoIds();
  const found = new Map<string, LiveVideoInfo & { source: "channel" | "search" }>();

  const channels = await trustedChannels();
  for (const channelUrl of channels) {
    try {
      const live = await fetchChannelLiveCandidates(channelUrl);
      summary.channelsCrawled++;
      for (const v of live) {
        if (!found.has(v.videoId)) found.set(v.videoId, { ...v, channelUrl: v.channelUrl ?? channelUrl.replace(/\/streams$/, ""), source: "channel" });
      }
    } catch (error) {
      console.warn("[discovery] channel failed", channelUrl, error);
    }
  }

  if (!options.noSearch) {
    for (const q of searchSlice()) {
      try {
        const live = await searchLiveVideos(q);
        summary.searchesRun++;
        for (const v of live) if (!found.has(v.videoId)) found.set(v.videoId, { ...v, source: "search" });
      } catch (error) {
        console.warn("[discovery] search failed", q, error);
      }
    }
  }
  summary.seen = found.size;

  const fresh = [...found.values()].filter((v) => !known.has(v.videoId)).slice(0, maxNew);
  summary.newCandidates = fresh.length;

  // --- analyse + decide ---------------------------------------------------
  const existing = await existingCameraPlaces();
  const priors = await channelCountries();
  const geocodeCache = new Map<string, Promise<GeocodeHit[]>>();
  for (const video of fresh) {
    const result = await analyseCandidate(video, existing, {
      priorCountry: video.channelUrl ? priors.get(channelKey(video.channelUrl)) ?? null : null,
      geocodeCache,
    });
    summary.analysed++;
    const detail = { videoId: video.videoId, title: video.title, outcome: result.status as string, placename: result.placename ?? undefined };
    if (result.status === "rejected") {
      summary.rejected[result.rejectReason ?? "unknown"] = (summary.rejected[result.rejectReason ?? "unknown"] ?? 0) + 1;
      detail.outcome = `rejected:${result.rejectReason}`;
    } else if (result.status === "approved") {
      summary.approved++;
    } else {
      summary.pending++;
    }
    summary.details.push(detail);

    if (options.dryRun) continue;
    const id = await insertCandidate(video, result);
    const repairs = result.rejectReason?.startsWith("repairs:") ? result.rejectReason.slice(8) : null;
    if (repairs) {
      const ok = await adoptStreamForCamera(repairs, video);
      if (ok) {
        summary.repaired++;
        const e = existing.find((x) => x.camera_id === repairs);
        if (e) e.link_available = true;
      }
    }
    if (result.status === "approved" && id !== null) {
      const cameraId = await approveCandidate(id, "auto");
      if (cameraId && result.latitude !== null && result.longitude !== null) {
        existing.push({ camera_id: cameraId, placename: result.placename ?? "", city: result.city, latitude: result.latitude, longitude: result.longitude, link_available: true });
      }
    }
  }

  if (!options.dryRun) {
    summary.retired = await retireStaleCameras();
  }
  return summary;
}

/* ---------------------------------------------------------------------- */

type ExistingPlace = {
  camera_id: string;
  placename: string;
  city: string | null;
  latitude: number;
  longitude: number;
  link_available: boolean;
};

type Decision = {
  status: CandidateStatus;
  decidedBy: "auto" | null;
  rejectReason: string | null;
  placename: string | null;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  tag: string | null;
  metadata: CameraMetadata | null;
  confidence: number | null;
  analysis: Record<string, unknown>;
};

async function analyseCandidate(
  video: LiveVideoInfo & { source: "channel" | "search" },
  existing: ExistingPlace[],
  ctx: { priorCountry: string | null; geocodeCache: Map<string, Promise<GeocodeHit[]>> }
): Promise<Decision> {
  const reject = (reason: string, partial: Partial<Decision> = {}): Decision => ({
    status: "rejected", decidedBy: "auto", rejectReason: reason,
    placename: null, city: null, country: null, latitude: null, longitude: null, timezone: null,
    tag: null, metadata: null, confidence: null, analysis: {}, ...partial,
  });

  // 0. Broadcasts (news, events) are never a fixed camera view.
  if (looksLikeBroadcast(video.title, video.channelUrl)) return reject("broadcast");

  // 1. Playable and embeddable, or it is useless to us.
  const probe = await isCameraAvailable(buildCameraStub(video.videoId, video.title));
  if (!probe.available) return reject(`unplayable:${probe.reason}`);

  // 2. Read the title. Rules first — geocoding doubles as verification —
  //    and only if they are not confident, the model (when configured).
  const bar = video.source === "channel" ? AUTO_APPROVE_CHANNEL : AUTO_APPROVE_SEARCH;
  const rules = await analyzeTitleByRules(video.title, {
    priorCountry: ctx.priorCountry,
    cache: ctx.geocodeCache,
  });
  let analysis: StreamAnalysis = rules;
  let hit: GeocodeHit | null = rules.hit;
  let how = "rules";
  const base: Record<string, unknown> = { rules: { ...rules, hit: undefined }, evidence: rules.evidence };

  if (rules.confidence < bar && llmConfigured()) {
    const llm = await analyzeStreamTitle({
      title: video.title,
      channelUrl: video.channelUrl ?? null,
      channelName: video.channelUrl?.split("/").pop() ?? null,
    });
    if (llm && llm.confidence > rules.confidence) {
      analysis = llm;
      how = "claude-opus-5";
      base.model = llm;
      const located = await locateCandidate(llm);
      hit = located?.hit ?? null;
      if (!hit) return reject("geocode-failed", { analysis: base, confidence: llm.confidence, placename: llm.placename, city: llm.city, country: llm.country });
    }
  }
  base.how = how;

  if (!analysis.isFixedOutdoorView) return reject("not-fixed-view", { analysis: base, confidence: analysis.confidence });
  if (!hit || analysis.confidence < MIN_CONFIDENCE) {
    return reject("low-confidence", { analysis: base, confidence: analysis.confidence, placename: analysis.placename, city: analysis.city, country: analysis.country });
  }

  // 4. Not a second view of a camera we already have. A match against a
  //    camera that is *down* is the opposite of a duplicate: it is the
  //    stream that camera has been waiting for, so hand it over.
  const near = existing.filter(
    (e) => distanceKm(e.latitude, e.longitude, hit.latitude, hit.longitude) <= DUPLICATE_KM
  );
  //    Proximity already vouches for the location, so compare names only
  //    (calculatePlaceMatch without a city is 0.7 × name coverage).
  const scored = near
    .map((e) => ({ e, score: Math.max(
      calculatePlaceMatch(e.placename, null, analysis.placename),
      calculatePlaceMatch(e.placename, null, video.title)
    ) }))
    .sort((a, b) => b.score - a.score);
  const live = scored.find(({ e, score }) => e.link_available && score >= 0.49); // ≥70% of the name
  if (live) return reject(`duplicate-of:${live.e.camera_id}`, { analysis: base, confidence: analysis.confidence, placename: analysis.placename });
  const down = scored.find(({ e, score }) => !e.link_available && score >= 0.35); // ≥50% of the name
  if (down) {
    return {
      status: "rejected", decidedBy: "auto", rejectReason: `repairs:${down.e.camera_id}`,
      placename: analysis.placename, city: analysis.city ?? hit.name, country: analysis.country || hit.country,
      latitude: hit.latitude, longitude: hit.longitude, timezone: hit.timezone, tag: null, metadata: null,
      confidence: analysis.confidence, analysis: { ...base, geocode: hit, repairs: down.e.camera_id },
    };
  }

  const metadata: CameraMetadata = {
    primaryType: analysis.primaryType,
    isFarpoint: false,
    tier: "t2",
    resolution: analysis.resolution,
    viewingTime: analysis.viewingTime,
    weatherTolerance: analysis.weatherTolerance,
  };

  const auto = analysis.confidence >= bar;

  return {
    status: auto ? "approved" : "pending",
    decidedBy: auto ? "auto" : null,
    rejectReason: null,
    placename: analysis.placename,
    city: analysis.city ?? hit.name,
    country: analysis.country || hit.country,
    latitude: hit.latitude,
    longitude: hit.longitude,
    timezone: hit.timezone,
    tag: analysis.tags.join(","),
    metadata,
    confidence: analysis.confidence,
    analysis: { ...base, geocode: hit },
  };
}

/* ---------------------------------------------------------------------- */

async function knownVideoIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  const cams = await query<{ link: string | null }>(`SELECT link FROM camera_ytb`);
  for (const c of cams) {
    const m = c.link?.match(/[?&]v=([\w-]{11})/);
    if (m) ids.add(m[1]);
  }
  const cands = await query<{ video_id: string }>(`SELECT video_id FROM camera_candidates`);
  for (const c of cands) ids.add(c.video_id);
  return ids;
}

/** Majority country of each host channel's existing cameras. */
async function channelCountries(): Promise<Map<string, string>> {
  const rows = await query<{ host_link: string; country: string; n: number }>(
    `SELECT host_link, country, COUNT(*) AS n FROM camera_ytb
     WHERE host_link IS NOT NULL AND country IS NOT NULL AND country != ''
     GROUP BY host_link, country`
  );
  const best = new Map<string, { country: string; n: number }>();
  for (const r of rows) {
    const key = channelKey(r.host_link);
    const cur = best.get(key);
    if (!cur || r.n > cur.n) best.set(key, { country: r.country, n: r.n });
  }
  return new Map([...best].map(([k, v]) => [k, v.country]));
}

function channelKey(url: string): string {
  return url.toLowerCase().replace(/\/(streams|live|videos|featured)\/?$/, "").replace(/\/+$/, "");
}

async function trustedChannels(): Promise<string[]> {
  const rows = await query<{ host_link: string }>(
    `SELECT DISTINCT host_link FROM camera_ytb
     WHERE link_available = 1 AND host_link IS NOT NULL AND host_link != ''`
  );
  return rows.map((r) => r.host_link);
}

function searchSlice(now = new Date()): string[] {
  const week = Math.floor(now.getTime() / (7 * 86_400_000));
  const start = (week * SEARCHES_PER_RUN) % SEARCH_QUERIES.length;
  return Array.from({ length: SEARCHES_PER_RUN }, (_, i) => SEARCH_QUERIES[(start + i) % SEARCH_QUERIES.length]);
}

async function existingCameraPlaces(): Promise<ExistingPlace[]> {
  const rows = await query<Omit<ExistingPlace, "link_available"> & { link_available: number | null }>(
    `SELECT camera_id, placename, city, latitude, longitude, link_available FROM camera_ytb
     WHERE latitude IS NOT NULL AND longitude IS NOT NULL`
  );
  return rows.map((r) => ({ ...r, link_available: r.link_available !== 0 }));
}

async function insertCandidate(
  video: LiveVideoInfo & { source: "channel" | "search" },
  d: Decision
): Promise<number | null> {
  const now = nowIso();
  await execute(
    `INSERT OR IGNORE INTO camera_candidates
       (video_id, title, channel_url, source, discovered_at, status, decided_by, reject_reason,
        placename, city, country, latitude, longitude, timezone, tag, camera_metadata,
        confidence, analysis, decided_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    video.videoId, video.title, video.channelUrl ?? null, video.source, now,
    d.status === "approved" ? "pending" : d.status, // approveCandidate flips it
    d.status === "rejected" ? "auto" : null, d.rejectReason,
    d.placename, d.city, d.country, d.latitude, d.longitude, d.timezone, d.tag,
    d.metadata ? JSON.stringify(d.metadata) : null,
    d.confidence, JSON.stringify(d.analysis),
    d.status === "rejected" ? now : null
  );
  const row = await queryOne<{ id: number }>(`SELECT id FROM camera_candidates WHERE video_id = ?`, video.videoId);
  return row?.id ?? null;
}

/**
 * Turn a candidate into a camera_ytb row. Used by the auto path and by the
 * admin review page. Returns the new camera_id, or null if the candidate is
 * not adoptable (missing location, already decided).
 */
export async function approveCandidate(id: number, by: "auto" | "admin"): Promise<string | null> {
  const c = await queryOne<CandidateRow>(`SELECT * FROM camera_candidates WHERE id = ?`, id);
  if (!c || c.status === "approved" || c.latitude === null || c.longitude === null) return null;

  const max = await queryOne<{ m: number | null }>(`SELECT MAX(CAST(camera_id AS INTEGER)) AS m FROM camera_ytb`);
  const cameraId = String((max?.m ?? 0) + 1);
  const now = nowIso();

  await execute(
    `INSERT INTO camera_ytb
       (camera_id, link, placename, city, country, latitude, longitude, timezone, info_0, tag,
        host_link, ytb_title, link_available, sunset_delay, sunrise_advance, last_check,
        camera_metadata, consecutive_failures)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 0, ?, ?, 0)`,
    cameraId,
    `https://www.youtube.com/watch?v=${c.video_id}`,
    c.placename, c.city, c.country, c.latitude, c.longitude, c.timezone,
    `Discovered ${c.discovered_at.slice(0, 10)} via ${c.source}`,
    c.tag,
    c.channel_url ? `${c.channel_url.replace(/\/streams$/, "")}/streams` : null,
    c.title, now, c.camera_metadata
  );
  await execute(
    `UPDATE camera_candidates SET status = 'approved', decided_by = ?, decided_at = ?, camera_id = ? WHERE id = ?`,
    by, now, cameraId, id
  );
  console.log(`[discovery] approved candidate ${id} as camera ${cameraId} (${c.placename})`);
  return cameraId;
}

/** Point a down camera at a discovered stream (and un-retire it). */
async function adoptStreamForCamera(cameraId: string, video: LiveVideoInfo): Promise<boolean> {
  const cam = await queryOne<{ link_available: number | null }>(`SELECT link_available FROM camera_ytb WHERE camera_id = ?`, cameraId);
  if (!cam || cam.link_available === 1) return false;
  await execute(
    `UPDATE camera_ytb
     SET link = ?, ytb_title = ?, host_link = COALESCE(?, host_link), link_available = 1,
         consecutive_failures = 0, unavailable_since = NULL, retired_at = NULL, last_check = ?
     WHERE camera_id = ?`,
    `https://www.youtube.com/watch?v=${video.videoId}`,
    video.title,
    video.channelUrl ? `${video.channelUrl.replace(/\/streams$/, "")}/streams` : null,
    nowIso(),
    cameraId
  );
  console.log(`[discovery] repaired camera ${cameraId} with ${video.videoId}`);
  return true;
}

export async function rejectCandidate(id: number, reason = "admin"): Promise<boolean> {
  const c = await queryOne<CandidateRow>(`SELECT id, status FROM camera_candidates WHERE id = ?`, id);
  if (!c || c.status === "approved") return false;
  await execute(
    `UPDATE camera_candidates SET status = 'rejected', decided_by = 'admin', reject_reason = ?, decided_at = ? WHERE id = ?`,
    reason, nowIso(), id
  );
  return true;
}

/** Cameras down for RETIRE_AFTER_DAYS leave the repair queue. Returns how many. */
export async function retireStaleCameras(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - RETIRE_AFTER_DAYS * 86_400_000).toISOString();
  const stale = await query<{ camera_id: string }>(
    `SELECT camera_id FROM camera_ytb
     WHERE link_available = 0 AND retired_at IS NULL
       AND unavailable_since IS NOT NULL AND unavailable_since < ?`,
    cutoff
  );
  for (const row of stale) {
    await execute(`UPDATE camera_ytb SET retired_at = ? WHERE camera_id = ?`, now.toISOString(), row.camera_id);
    console.log(`[discovery] retired camera ${row.camera_id}`);
  }
  return stale.length;
}

export function candidateMetadata(row: CandidateRow): CameraMetadata | null {
  return parseJson<CameraMetadata>(row.camera_metadata);
}
