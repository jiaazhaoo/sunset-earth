import { buildCameraStub, getCameraById, type CameraRecord } from "@/lib/cameras";
import { execute, query, nowIso } from "@/lib/db";
import { isCameraAvailable } from "@/lib/availability";
import {
  calculatePlaceMatch,
  fetchChannelLiveCandidates,
  looksLikeBroadcast,
  searchLiveVideos,
  type LiveVideoInfo,
} from "@/lib/youtube";

/**
 * Minimum place-match score to accept a replacement. With the 0.7/0.3
 * name/city weighting this means "most of the place name is in the title";
 * a city-only hit (0.3) is never enough on its own.
 */
const MIN_MATCH_SCORE = 0.5;

/**
 * Stricter bar for streams found via site-wide search: those come from
 * arbitrary channels, so a same-city-different-view match (which the host
 * channel fallback tolerates) is not good enough here.
 */
const MIN_SEARCH_MATCH_SCORE = 0.7;

export type RefreshResult =
  | {
      updated: true;
      similarity: number;
      title: string;
      /** "channel" = host channel's /streams tab, "search" = YouTube search. */
      source: "channel" | "search";
      camera: CameraRecord;
    }
  | {
      updated: false;
      reason: "not-found" | "missing-host" | "no-live" | "no-playable" | "no-match";
      bestScore?: number;
    };

export type RefreshOptions = {
  /**
   * Live-stream candidates per channel URL, shared across one batch run so
   * that cameras on the same channel (often 20+) fetch the page once.
   */
  channelCache?: Map<string, Promise<LiveVideoInfo[]>>;
  /** Skip the YouTube-search fallback (host channel only). */
  noSearch?: boolean;
};

export async function refreshCameraById(
  cameraId: string,
  options: RefreshOptions = {}
): Promise<RefreshResult> {
  const camera = await getCameraById(cameraId);
  if (!camera) {
    return { updated: false, reason: "not-found" };
  }
  return refreshCamera(camera, options);
}

export async function refreshCamera(
  camera: CameraRecord,
  options: RefreshOptions = {}
): Promise<RefreshResult> {
  // No pre-check of the current stream here: a dead live stream and an
  // embed-restricted one both probe as playability_blocked, and in either case
  // the right move is to look for a replacement.
  //
  // Never hand two cameras the same stream — every camera has its own
  // location, weather and sun times, so duplicates make the rankings lie.
  // Only streams shown by *available* cameras count as taken: a demoted
  // camera's stale link should not block the camera it really belongs to.
  const takenByOthers = await videoIdsUsedByOtherCameras(camera.id);

  // 1. The camera's own host channel: cheap, and the most likely place for
  //    the same view to reappear under a new video id.
  let channelResult: RefreshResult | null = null;
  if (camera.hostLink) {
    const candidates = await loadChannelCandidates(camera.hostLink, options);
    channelResult = candidates.length
      ? await adoptBestMatch(camera, candidates, MIN_MATCH_SCORE, takenByOthers, "channel")
      : { updated: false, reason: "no-live" };
    if (channelResult.updated) {
      return channelResult;
    }
  }

  // 2. Site-wide search for a live stream of this place. Any channel will do,
  //    but the match has to be tighter, and the camera's host_link follows
  //    the stream to its new channel so future repairs look there first.
  if (!options.noSearch) {
    const query = [camera.name, camera.city, "live cam"].filter(Boolean).join(" ");
    let found: LiveVideoInfo[] = [];
    try {
      found = await searchLiveVideos(query);
    } catch (error) {
      console.warn("[refreshCamera] search failed", camera.id, error);
    }
    if (found.length) {
      const searchResult = await adoptBestMatch(
        camera, found, MIN_SEARCH_MATCH_SCORE, takenByOthers, "search"
      );
      if (searchResult.updated) {
        return searchResult;
      }
      if (!channelResult || channelResult.reason === "no-live") {
        return searchResult;
      }
    }
  }

  return channelResult ?? { updated: false, reason: "missing-host" };
}

async function adoptBestMatch(
  camera: CameraRecord,
  candidates: LiveVideoInfo[],
  minScore: number,
  takenByOthers: Set<string>,
  source: "channel" | "search"
): Promise<RefreshResult> {
  // Match on the curated place name + city, never on ytb_title: that column
  // holds whatever stream the camera last pointed at, and years of automated
  // replacement have drifted it away from the real location for many rows.
  const scored = candidates
    // A news channel covering the landmark is not a camera on it.
    .filter((live) => !looksLikeBroadcast(live.title, live.channelUrl ?? camera.hostLink))
    .map((live) => ({
      ...live,
      score: calculatePlaceMatch(camera.name, camera.city, live.title),
    }))
    .sort((a, b) => b.score - a.score);

  const eligible = scored.filter((c) => c.score >= minScore);
  if (!eligible.length) {
    return { updated: false, reason: "no-match", bestScore: scored[0]?.score ?? 0 };
  }

  let sawPlayable = false;
  for (const match of eligible) {
    if (takenByOthers.has(match.videoId)) {
      continue;
    }
    const playable = await isCameraAvailable(
      buildCameraStub(match.videoId, match.title)
    );
    if (!playable.available) {
      continue;
    }
    sawPlayable = true;

    const newLink = `https://www.youtube.com/watch?v=${match.videoId}`;
    const newHost =
      source === "search" && match.channelUrl
        ? `${match.channelUrl}/streams`
        : camera.hostLink;
    await execute(
      `UPDATE camera_ytb
       SET link = ?, ytb_title = ?, host_link = ?, link_available = 1, last_check = ?
       WHERE camera_id = ?`,
      newLink,
      match.title,
      newHost,
      nowIso(),
      camera.id
    );

    const updatedCamera = await getCameraById(camera.id);
    console.log(
      `[refreshCamera] ${camera.id} "${camera.name}" -> ${match.videoId} via ${source} (${match.score.toFixed(2)}) ${match.title}`
    );
    return {
      updated: true,
      similarity: match.score,
      title: match.title,
      source,
      camera: updatedCamera ?? camera,
    };
  }

  return { updated: false, reason: sawPlayable ? "no-match" : "no-playable" };
}

async function loadChannelCandidates(
  hostLink: string,
  options: RefreshOptions
): Promise<LiveVideoInfo[]> {
  const cache = options.channelCache;
  if (!cache) {
    return fetchChannelLiveCandidates(hostLink);
  }
  let pending = cache.get(hostLink);
  if (!pending) {
    pending = fetchChannelLiveCandidates(hostLink).catch((error) => {
      console.warn("[refreshCamera] channel fetch failed", hostLink, error);
      return [];
    });
    cache.set(hostLink, pending);
  }
  return pending;
}

async function videoIdsUsedByOtherCameras(cameraId: string): Promise<Set<string>> {
  const rows = await query<{ link: string | null }>(
    `SELECT link FROM camera_ytb
     WHERE camera_id != ? AND link IS NOT NULL AND link_available = 1`,
    cameraId
  );
  const ids = new Set<string>();
  for (const row of rows) {
    const id = extractVideoId(row.link);
    if (id) ids.add(id);
  }
  return ids;
}

function extractVideoId(sourceUrl: string | null | undefined) {
  if (!sourceUrl) {
    return null;
  }
  try {
    const url = new URL(sourceUrl);
    if (url.hostname === "youtu.be") {
      return url.pathname.replace("/", "");
    }
    if (url.searchParams.has("v")) {
      return url.searchParams.get("v");
    }
    const liveMatch = url.pathname.match(/\/live\/([\w-]+)/);
    if (liveMatch) {
      return liveMatch[1];
    }
  } catch {
    return null;
  }
  return null;
}
