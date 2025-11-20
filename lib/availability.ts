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
  const targetUrl = buildYoutubeEmbedUrl(url) ?? buildYoutubeWatchUrl(url);
  if (!targetUrl) {
    return true;
  }

  const response = await fetch(targetUrl, {
    method: "GET",
    headers: { "User-Agent": "SunsetEarth/1.0 availability" },
    cache: "no-store",
    redirect: "follow",
  });

  if (!response.ok) {
    return false;
  }

  const html = await response.text();
  const unavailablePhrases = [
    "This live stream recording is not available",
    "Video unavailable",
    "Private video",
    "Playback on other websites has been disabled",
  ];

  return !unavailablePhrases.some((phrase) => html.includes(phrase));
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
      const params = new URLSearchParams();
      params.set("v", parsed.searchParams.get("v") ?? "");
      if (parsed.searchParams.has("list")) {
        params.set("list", parsed.searchParams.get("list") ?? "");
      }
      if (parsed.searchParams.has("index")) {
        params.set("index", parsed.searchParams.get("index") ?? "");
      }
      const query = params.toString();
      return `https://www.youtube.com/watch${query ? `?${query}` : ""}`;
    }

    return parsed.toString();
  } catch (error) {
    console.warn("[availability] invalid youtube url", error);
    return null;
  }
}

function buildYoutubeEmbedUrl(url: string) {
  try {
    const parsed = new URL(url);
    let videoId: string | null = null;

    if (parsed.hostname === "youtu.be") {
      videoId = parsed.pathname.replace("/", "") || null;
    } else if (parsed.pathname.startsWith("/embed/")) {
      videoId = parsed.pathname.split("/")[2] ?? null;
    } else if (parsed.searchParams.has("v")) {
      videoId = parsed.searchParams.get("v");
    }

    if (!videoId) {
      return null;
    }

    const params = new URLSearchParams();
    if (parsed.searchParams.has("list")) {
      params.set("list", parsed.searchParams.get("list") ?? "");
    }
    if (parsed.searchParams.has("index")) {
      params.set("index", parsed.searchParams.get("index") ?? "");
    }
    const query = params.toString();
    return `https://www.youtube.com/embed/${videoId}${query ? `?${query}` : ""}`;
  } catch (error) {
    console.warn("[availability] invalid youtube url", error);
    return null;
  }
}
