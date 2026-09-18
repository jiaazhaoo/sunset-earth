import { isCameraAvailable } from "@/lib/availability";
import { buildCameraStub } from "@/lib/cameras";
import { execute, query, queryOne, nowIso, parseJson } from "@/lib/db";
import { distanceKm, locateCandidate, type GeocodeHit } from "@/lib/geocode";
import {
  analyzeStreamTitle,
  analyzeTitleHeuristically,
  llmConfigured,
  type StreamAnalysis,
} from "@/lib/llm";
import {
  calculatePlaceMatch,
  fetchChannelLiveCandidates,
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
 *   analyse  → playable + embeddable?  →  Claude reads the title  →
 *              Open-Meteo geocodes the place  →  duplicate check
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
  pending: number;
  rejected: Record<string, number>;
  retired: number;
  /** Whether Claude was available; without it nothing is auto-approved. */
  llm: boolean;
  details: Array<{ videoId: string; title: string; outcome: string; placename?: string }>;
};

export type DiscoveryOptions = {
  /** Stop after analysing this many new streams (subrequest budget). */
  maxNew?: number;
  /** Skip site-wide search, crawl known channels only. */
  noSearch?: boolean;
  /** Analyse and report but write nothing. */
  dryRun?: boolean;
};

export async function runDiscovery(options: DiscoveryOptions = {}): Promise<DiscoverySummary> {
  const maxNew = options.maxNew ?? 60;
  const summary: DiscoverySummary = {
    channelsCrawled: 0, searchesRun: 0, seen: 0, newCandidates: 0, analysed: 0,
    approved: 0, pending: 0, rejected: {}, retired: 0, llm: llmConfigured(), details: [],
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
  for (const video of fresh) {
    const result = await analyseCandidate(video, existing);
    summary.analysed++;
    const detail = { videoId: video.videoId, title: video.title, outcome: result.status as string, placename: result.placename ?? undefined };
    // Without a model the heuristic parser cannot vouch for a location. Do
    // not record those as rejected — leave them unknown so the run after
    // ANTHROPIC_API_KEY is configured reads them properly.
    if (!summary.llm && result.rejectReason === "low-confidence") {
      detail.outcome = "skipped:no-model";
      summary.details.push(detail);
      continue;
    }
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
    if (result.status === "approved" && id !== null) {
      const cameraId = await approveCandidate(id, "auto");
      if (cameraId && result.latitude !== null && result.longitude !== null) {
        existing.push({ camera_id: cameraId, placename: result.placename ?? "", city: result.city, latitude: result.latitude, longitude: result.longitude });
      }
    }
  }

  if (!options.dryRun) {
    summary.retired = await retireStaleCameras();
  }
  return summary;
}

/* ---------------------------------------------------------------------- */

type ExistingPlace = { camera_id: string; placename: string; city: string | null; latitude: number; longitude: number };

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
  existing: ExistingPlace[]
): Promise<Decision> {
  const reject = (reason: string, partial: Partial<Decision> = {}): Decision => ({
    status: "rejected", decidedBy: "auto", rejectReason: reason,
    placename: null, city: null, country: null, latitude: null, longitude: null, timezone: null,
    tag: null, metadata: null, confidence: null, analysis: {}, ...partial,
  });

  // 1. Playable and embeddable, or it is useless to us.
  const probe = await isCameraAvailable(buildCameraStub(video.videoId, video.title));
  if (!probe.available) return reject(`unplayable:${probe.reason}`);

  // 2. Read the title.
  const llm = await analyzeStreamTitle({
    title: video.title,
    channelUrl: video.channelUrl ?? null,
    channelName: video.channelUrl?.split("/").pop() ?? null,
  });
  const analysis: StreamAnalysis = llm ?? analyzeTitleHeuristically(video.title);
  const base: Record<string, unknown> = { model: llm ? "claude-opus-5" : "heuristic", analysis };

  if (!analysis.isFixedOutdoorView) return reject("not-fixed-view", { analysis: base, confidence: analysis.confidence });
  if (analysis.confidence < MIN_CONFIDENCE) return reject("low-confidence", { analysis: base, confidence: analysis.confidence });

  // 3. Coordinates and timezone.
  const located = await locateCandidate(analysis);
  if (!located) return reject("geocode-failed", { analysis: base, confidence: analysis.confidence, placename: analysis.placename, city: analysis.city, country: analysis.country });
  const hit: GeocodeHit = located.hit;

  // 4. Not a second view of a camera we already have.
  const dup = existing.find(
    (e) =>
      distanceKm(e.latitude, e.longitude, hit.latitude, hit.longitude) <= DUPLICATE_KM &&
      calculatePlaceMatch(e.placename, e.city, analysis.placename) >= 0.7
  );
  if (dup) return reject(`duplicate-of:${dup.camera_id}`, { analysis: base, confidence: analysis.confidence, placename: analysis.placename });

  const metadata: CameraMetadata = {
    primaryType: analysis.primaryType,
    isFarpoint: false,
    tier: "t2",
    resolution: analysis.resolution,
    viewingTime: analysis.viewingTime,
    weatherTolerance: analysis.weatherTolerance,
  };

  const bar = video.source === "channel" ? AUTO_APPROVE_CHANNEL : AUTO_APPROVE_SEARCH;
  const auto = Boolean(llm) && analysis.confidence >= bar;

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
    analysis: { ...base, geocode: { via: located.via, ...hit } },
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
  const rows = await query<ExistingPlace>(
    `SELECT camera_id, placename, city, latitude, longitude FROM camera_ytb
     WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND retired_at IS NULL`
  );
  return rows;
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
