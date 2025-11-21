import { getCameraById, type CameraRecord } from "@/lib/cameras";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  calculateSimilarity,
  fetchChannelLiveVideo,
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

  const live = await fetchChannelLiveVideo(camera.hostLink);
  if (!live) {
    return { updated: false, reason: "no-live" as const };
  }

  const referenceTitle = camera.ytbTitle ?? camera.name ?? "";
  const similarity = calculateSimilarity(referenceTitle, live.title ?? "");
  if (similarity < 0.75) {
    return {
      updated: false,
      reason: "low-similarity" as const,
      similarity,
    };
  }

  const newLink = `https://www.youtube.com/watch?v=${live.videoId}`;
  const currentVideoId = extractVideoId(camera.sourceUrl);
  if (currentVideoId && currentVideoId === live.videoId) {
    return {
      updated: false,
      reason: "same-video" as const,
      similarity,
    };
  }

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
