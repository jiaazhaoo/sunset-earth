import { getCameraById, type CameraRecord } from "@/lib/cameras";
import { execute, query, nowIso } from "@/lib/db";
import { isCameraAvailable } from "@/lib/availability";
import {
  calculatePlaceMatch,
  fetchChannelLiveCandidates,
  type LiveVideoInfo,
} from "@/lib/youtube";

/**
 * Minimum place-match score to accept a replacement. With the 0.7/0.3
 * name/city weighting this means "most of the place name is in the title";
 * a city-only hit (0.3) is never enough on its own.
 */
const MIN_MATCH_SCORE = 0.5;

export type RefreshResult =
  | {
      updated: true;
      similarity: number;
      title: string;
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
  // the right move is to look for a replacement on the host channel.
  if (!camera.hostLink) {
    return { updated: false, reason: "missing-host" };
  }

  const candidates = await loadChannelCandidates(camera.hostLink, options);
  if (!candidates.length) {
    return { updated: false, reason: "no-live" };
  }

  // Match on the curated place name + city, never on ytb_title: that column
  // holds whatever stream the camera last pointed at, and years of automated
  // replacement have drifted it away from the real location for many rows.
  const scored = candidates
    .map((live) => ({
      ...live,
      score: calculatePlaceMatch(camera.name, camera.city, live.title),
    }))
    .filter((c) => c.score >= MIN_MATCH_SCORE)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) {
    const best = Math.max(0, ...candidates.map((c) =>
      calculatePlaceMatch(camera.name, camera.city, c.title)
    ));
    return { updated: false, reason: "no-match", bestScore: best };
  }

  // Never hand two cameras the same stream — every camera has its own
  // location, weather and sun times, so duplicates make the rankings lie.
  // Only streams shown by *available* cameras count as taken: a demoted
  // camera's stale link should not block the camera it really belongs to.
  const takenByOthers = await videoIdsUsedByOtherCameras(camera.id);

  let sawPlayable = false;
  for (const match of scored) {
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
    await execute(
      `UPDATE camera_ytb
       SET link = ?, ytb_title = ?, link_available = 1, last_check = ?
       WHERE camera_id = ?`,
      newLink,
      match.title,
      nowIso(),
      camera.id
    );

    const updatedCamera = await getCameraById(camera.id);
    console.log(
      `[refreshCamera] ${camera.id} "${camera.name}" -> ${match.videoId} (${match.score.toFixed(2)}) ${match.title}`
    );
    return {
      updated: true,
      similarity: match.score,
      title: match.title,
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

function buildCameraStub(videoId: string, title?: string | null): CameraRecord {
  const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&rel=0&playsinline=1`;
  const sourceUrl = `https://www.youtube.com/watch?v=${videoId}`;
  return {
    id: videoId,
    name: title ?? videoId,
    embedUrl,
    sourceUrl,
    lat: null,
    lng: null,
    timezone: null,
    city: null,
    country: null,
    tags: [],
    hostLink: null,
    ytbTitle: title ?? null,
    linkAvailable: true,
    sunsetDelay: 0,
    sunriseAdvance: 0,
    lastCheck: null,
    metadata: null,
  };
}
