import { getCameraById, type CameraRecord } from "@/lib/cameras";
import { execute, nowIso } from "@/lib/db";
import { isCameraAvailable } from "@/lib/availability";
import {
  calculateSimilarity,
  calculateSmartSimilarity,
  fetchChannelLiveCandidates,
} from "@/lib/youtube";

export async function refreshCameraById(cameraId: string) {
  const camera = await getCameraById(cameraId);
  if (!camera) {
    return { updated: false, reason: "not-found" as const };
  }
  return refreshCamera(camera);
}

type MatchCandidate = {
  videoId: string;
  title: string;
  similarity: number;
  matchType: "exact" | "smart" | "relaxed";
};

export async function refreshCamera(camera: CameraRecord) {
  // If current stream is explicitly embed-blocked, skip replacement attempts
  const availability = await isCameraAvailable(camera);
  if (!availability.available && availability.reason === "playability_blocked") {
    return { updated: false, reason: "embed-blocked" as const };
  }

  if (!camera.hostLink) {
    return { updated: false, reason: "missing-host" as const };
  }

  const candidates = await fetchChannelLiveCandidates(camera.hostLink);
  if (!candidates.length) {
    return { updated: false, reason: "no-live" as const };
  }

  const currentVideoId = extractVideoId(camera.sourceUrl);
  const referenceTitle = camera.ytbTitle ?? camera.name ?? "";

  // Multi-layer matching strategy: collect all playable candidates with their scores
  const playableCandidates: MatchCandidate[] = [];

  for (const live of candidates) {
    if (!live.videoId) {
      continue;
    }
    if (currentVideoId && currentVideoId === live.videoId) {
      continue;
    }

    const playable = await isCameraAvailable(
      buildCameraStub(live.videoId, live.title)
    );
    if (!playable.available) {
      continue;
    }

    // Calculate multiple similarity scores
    const exactSimilarity = calculateSimilarity(referenceTitle, live.title ?? "");
    const smartSimilarity = calculateSmartSimilarity(referenceTitle, live.title ?? "");

    // Determine match type and score
    let matchType: "exact" | "smart" | "relaxed" = "relaxed";
    let similarity = Math.max(exactSimilarity, smartSimilarity);

    if (exactSimilarity >= 0.75) {
      matchType = "exact";
      similarity = exactSimilarity;
    } else if (smartSimilarity >= 0.5) {
      matchType = "smart";
      similarity = smartSimilarity;
    }

    playableCandidates.push({
      videoId: live.videoId,
      title: live.title ?? "",
      similarity,
      matchType,
    });
  }

  // Sort by similarity (highest first)
  playableCandidates.sort((a, b) => b.similarity - a.similarity);

  // Try to find a match using tiered thresholds
  const thresholds = [
    { type: "exact" as const, minScore: 0.75 },
    { type: "smart" as const, minScore: 0.45 },  // Lowered from 0.5 to catch more location matches
    { type: "relaxed" as const, minScore: 0.3 },
  ];

  for (const threshold of thresholds) {
    const match = playableCandidates.find(
      c => c.matchType === threshold.type && c.similarity >= threshold.minScore
    );

    if (match) {
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
      console.log(`[refreshCamera] ${camera.id} matched with ${threshold.type} (${match.similarity.toFixed(3)})`);
      return {
        updated: Boolean(updatedCamera),
        similarity: match.similarity,
        matchType: threshold.type,
        camera: updatedCamera ?? camera,
      };
    }
  }

  return { updated: false, reason: "no-playable" as const };
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
