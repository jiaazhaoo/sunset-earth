import { getCameraById, type CameraRecord } from "@/lib/cameras";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isCameraAvailable } from "@/lib/availability";
import {
  calculateSimilarity,
  fetchChannelLiveCandidates,
} from "@/lib/youtube";

export async function refreshCameraById(cameraId: string) {
  const camera = await getCameraById(cameraId);
  if (!camera) {
    return { updated: false, reason: "not-found" as const };
  }
  return refreshCamera(camera);
}

export async function refreshCamera(camera: CameraRecord) {
  if (!camera.hostLink) {
    return { updated: false, reason: "missing-host" as const };
  }

  const candidates = await fetchChannelLiveCandidates(camera.hostLink);
  if (!candidates.length) {
    return { updated: false, reason: "no-live" as const };
  }

  const currentVideoId = extractVideoId(camera.sourceUrl);
  const referenceTitle = camera.ytbTitle ?? camera.name ?? "";

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

    const similarity = calculateSimilarity(referenceTitle, live.title ?? "");
    if (similarity < 0.75) {
      continue;
    }

    const newLink = `https://www.youtube.com/watch?v=${live.videoId}`;

    const { error } = await supabaseAdmin
      .from("camera_ytb")
      .update({
        link: newLink,
        ytb_title: live.title,
        link_available: true,
      })
      .eq("camera_id", camera.id);

    if (error) {
      throw new Error(error.message);
    }

    const updatedCamera = await getCameraById(camera.id);
    return {
      updated: Boolean(updatedCamera),
      similarity,
      camera: updatedCamera ?? camera,
    };
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
  };
}
