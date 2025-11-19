import type { CameraRecord } from "@/lib/cameras";

const TTL_MS = 15 * 60 * 1000;

const availabilityCache = new Map<
  string,
  { status: boolean; fetchedAt: number }
>();

export async function isCameraAvailable(camera: CameraRecord) {
  if (!camera.embedUrl) {
    return false;
  }

  const key = camera.sourceUrl ?? camera.embedUrl;
  const cached = availabilityCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return cached.status;
  }

  let status = true;
  try {
    if (isYoutubeUrl(key)) {
      status = await checkYoutubeAvailability(key);
    }
  } catch (error) {
    console.warn("[availability] check failed", error);
    status = true;
  }

  availabilityCache.set(key, { status, fetchedAt: Date.now() });
  return status;
}

function isYoutubeUrl(url: string) {
  return /youtu\.be|youtube\.com/.test(url);
}

async function checkYoutubeAvailability(url: string) {
  const watchUrl = buildYoutubeWatchUrl(url);
  if (!watchUrl) {
    return true;
  }

  const endpoint = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(
    watchUrl
  )}`;
  const response = await fetch(endpoint, {
    method: "GET",
    headers: { "User-Agent": "SunsetEarth/1.0 availability" },
    cache: "no-store",
  });
  return response.ok;
}

function buildYoutubeWatchUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "youtu.be") {
      return `https://www.youtube.com/watch?v=${parsed.pathname.replace("/", "")}`;
    }

    if (parsed.pathname.startsWith("/embed/")) {
      const id = parsed.pathname.split("/")[2];
      return id ? `https://www.youtube.com/watch?v=${id}` : null;
    }

    if (parsed.searchParams.has("v")) {
      return `https://www.youtube.com/watch?v=${parsed.searchParams.get("v")}`;
    }

    return parsed.toString();
  } catch (error) {
    console.warn("[availability] invalid youtube url", error);
    return null;
  }
}
