import type { CameraRecord } from "@/lib/cameras";

const TTL_MS = 15 * 60 * 1000;

export type AvailabilityReason =
  | "ok"
  | "missing_embed"
  | "oembed_forbidden"
  | "oembed_error"
  | "playability_blocked"
  | "unavailable_text"
  | "not_found"
  | "fetch_error"
  | "error";

export type AvailabilityResult = {
  available: boolean;
  reason: AvailabilityReason;
};

const availabilityCache = new Map<
  string,
  { result: AvailabilityResult; fetchedAt: number }
>();

export async function isCameraAvailable(
  camera: CameraRecord
): Promise<AvailabilityResult> {
  if (!camera.embedUrl) {
    return { available: false, reason: "missing_embed" };
  }

  const key = camera.sourceUrl ?? camera.embedUrl;
  const cached = availabilityCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return cached.result;
  }

  let result: AvailabilityResult = { available: true, reason: "ok" };
  try {
    if (isYoutubeUrl(key)) {
      result = await checkYoutubeAvailability(key);
    }
  } catch (error) {
    console.warn("[availability] check failed", error);
    result = { available: true, reason: "error" };
  }

  availabilityCache.set(key, { result, fetchedAt: Date.now() });
  return result;
}

function isYoutubeUrl(url: string) {
  return /youtu\.be|youtube\.com/.test(url);
}

async function checkYoutubeAvailability(url: string): Promise<AvailabilityResult> {
  const targetUrl = buildYoutubeEmbedUrl(url) ?? buildYoutubeWatchUrl(url);
  if (!targetUrl) {
    return { available: false, reason: "missing_embed" };
  }

  const watchProbe = buildYoutubeWatchUrl(url);
  if (watchProbe) {
    const playable = await fetchPlayabilityStatus(watchProbe);
    if (playable === "UNPLAYABLE") {
      return { available: false, reason: "unavailable_text" };
    }

    const oembedResponse = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(
        watchProbe
      )}`,
      {
        method: "GET",
        headers: { "User-Agent": "SunsetEarth/1.0 availability" },
        cache: "no-store",
      }
    );
    if (!oembedResponse.ok) {
      const reason =
        oembedResponse.status === 401 || oembedResponse.status === 403
          ? "oembed_forbidden"
          : "oembed_error";
      return { available: false, reason };
    }
  }

  const response = await fetch(targetUrl, {
    method: "GET",
    headers: { "User-Agent": "SunsetEarth/1.0 availability" },
    cache: "no-store",
    redirect: "follow",
  });

  if (!response.ok) {
    const reason =
      response.status === 404 ? "not_found" : "fetch_error";
    return { available: false, reason };
  }

  const html = await response.text();
  if (hasPlayabilityBlock(html)) {
    return { available: false, reason: "playability_blocked" };
  }
  const unavailablePhrases = [
    "This live stream recording is not available",
    "Video unavailable",
    "Private video",
    "Playback on other websites has been disabled",
  ];

  if (unavailablePhrases.some((phrase) => html.includes(phrase))) {
    return { available: false, reason: "unavailable_text" };
  }

  return { available: true, reason: "ok" };
}

async function fetchPlayabilityStatus(url: string) {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": "SunsetEarth/1.0 availability" },
      cache: "no-store",
    });
    if (!response.ok) {
      return null;
    }
    const html = await response.text();
    const match = html.match(/ytInitialPlayerResponse\s*=\s*(\{[\s\S]+?\})\s*;/);
    if (!match) {
      return null;
    }
    const data = JSON.parse(match[1]) as {
      playabilityStatus?: { status?: string };
    };
    return data.playabilityStatus?.status ?? null;
  } catch (error) {
    console.warn("[availability] playability status parse failed", error);
    return null;
  }
}

function buildYoutubeWatchUrl(url: string) {
  try {
    const parsed = new URL(url);
    const params = new URLSearchParams();
    copyPlaylistParams(parsed.searchParams, params);

    if (parsed.hostname === "youtu.be") {
      const entry = parsed.pathname.replace("/", "");
      if (!entry) return null;
      params.set("v", entry);
      const query = params.toString();
      return `https://www.youtube.com/watch${query ? `?${query}` : ""}`;
    }

    if (parsed.pathname.startsWith("/embed/")) {
      const id = parsed.pathname.split("/")[2];
      if (!id) return null;
      params.set("v", id);
      const query = params.toString();
      return `https://www.youtube.com/watch${query ? `?${query}` : ""}`;
    }

    if (parsed.searchParams.has("v")) {
      params.set("v", parsed.searchParams.get("v") ?? "");
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
    copyPlaylistParams(parsed.searchParams, params);
    const query = params.toString();
    return `https://www.youtube.com/embed/${videoId}${query ? `?${query}` : ""}`;
  } catch (error) {
    console.warn("[availability] invalid youtube url", error);
    return null;
  }
}

function hasPlayabilityBlock(html: string) {
  try {
    const match = html.match(/ytInitialPlayerResponse\s*=\s*(\{[\s\S]+?\})\s*;/);
    if (!match) {
      return false;
    }
    const data = JSON.parse(match[1]) as {
      playabilityStatus?: { status?: string; reason?: string };
    };
    const status = data.playabilityStatus?.status;
    if (status && status !== "OK") {
      return true;
    }
  } catch (error) {
    console.warn("[availability] failed to parse playability", error);
  }
  return false;
}

function copyPlaylistParams(
  source: URLSearchParams,
  target: URLSearchParams
) {
  if (source.has("list")) {
    const list = source.get("list");
    if (list) {
      target.set("list", list);
    }
  }
  if (source.has("index")) {
    const index = source.get("index");
    if (index) {
      target.set("index", index);
    }
  }
}
