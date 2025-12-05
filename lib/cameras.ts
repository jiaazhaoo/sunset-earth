import { supabaseAdmin } from "@/lib/supabaseAdmin";
import tzLookup from "tz-lookup";

const CAMERA_COLUMNS =
  "camera_id,link,placename,city,country,latitude,longitude,timezone,info_0,tag,host_link,ytb_title,link_available,sunset_delay,sunrise_advance,last_check";

export type CameraRow = {
  camera_id: number | string;
  link: string | null;
  placename: string | null;
  city: string | null;
  country: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  timezone: string | null;
  info_0: string | null;
  tag: string | null;
  host_link: string | null;
  ytb_title: string | null;
  link_available: boolean | null;
  sunset_delay: number | string | null;
  sunrise_advance: number | string | null;
  last_check: string | null;
};

export type CameraRecord = {
  id: string;
  name: string;
  embedUrl: string;
  sourceUrl: string | null;
  lat: number | null;
  lng: number | null;
  timezone: string | null;
  city: string | null;
  country: string | null;
  tags: string[];
  hostLink: string | null;
  ytbTitle: string | null;
  linkAvailable: boolean;
  sunsetDelay: number;
  sunriseAdvance: number;
  lastCheck: string | null;
};

export async function listCameras(limit = 200, offset = 0) {
  const { data, error } = await supabaseAdmin
    .from("camera_ytb")
    .select(CAMERA_COLUMNS)
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(mapCameraRow);
}

export async function getCameraById(cameraId: string) {
  const { data, error } = await supabaseAdmin
    .from("camera_ytb")
    .select(CAMERA_COLUMNS)
    .eq("camera_id", cameraId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? mapCameraRow(data) : null;
}

export async function getRandomCamera() {
  const pool = (await listCameras(200)).filter(
    (camera) => camera.linkAvailable !== false
  );
  if (!pool.length) {
    return null;
  }
  const randomIndex = Math.floor(Math.random() * pool.length);
  return pool[randomIndex];
}

function mapCameraRow(row: CameraRow): CameraRecord {
  const lat = toNumber(row.latitude);
  const lng = toNumber(row.longitude);
  const timezone = resolveTimezone(row.timezone, lat, lng);
  return {
    id: String(row.camera_id),
    name:
      row.placename ??
      row.info_0 ??
      (typeof row.camera_id === "number"
        ? `Camera ${row.camera_id}`
        : `Camera ${row.camera_id}`),
    embedUrl: buildEmbedUrl(row.link),
    sourceUrl: row.link ?? null,
    lat,
    lng,
    timezone,
    city: row.city || null,
    country: row.country || null,
    tags: parseTags(row.tag),
    hostLink: row.host_link ?? null,
    ytbTitle: row.ytb_title ?? null,
    linkAvailable: row.link_available ?? true,
    sunsetDelay: toNumber(row.sunset_delay) ?? 0,
    sunriseAdvance: toNumber(row.sunrise_advance) ?? 0,
    lastCheck: row.last_check ?? null,
  };
}

function resolveTimezone(
  value: string | null,
  lat: number | null,
  lng: number | null
) {
  if (value) {
    return value;
  }
  if (lat === null || lng === null) {
    return null;
  }
  try {
    return tzLookup(lat, lng);
  } catch (error) {
    console.warn(
      "Failed to resolve timezone from coordinates",
      lat,
      lng,
      error
    );
    return null;
  }
}

function parseTags(value: string | null) {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function toNumber(value: number | string | null) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "number") {
    return value;
  }

  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function buildEmbedUrl(link: string | null) {
  if (!link) {
    return "";
  }

  try {
    const url = new URL(link);
    const host = url.hostname;

    if (host === "youtu.be") {
      const videoId = url.pathname.replace("/", "");
      if (videoId) {
        return withEmbedParams(
          `https://www.youtube.com/embed/${videoId}`,
          url.searchParams
        );
      }
    }

    if (host.includes("youtube.com")) {
      if (url.pathname === "/watch") {
        const videoId = url.searchParams.get("v");
        if (videoId) {
          return withEmbedParams(
            `https://www.youtube.com/embed/${videoId}`,
            url.searchParams
          );
        }
      }

      if (url.pathname.startsWith("/live/")) {
        const videoId = url.pathname.split("/").pop();
        if (videoId) {
          return withEmbedParams(
            `https://www.youtube.com/embed/${videoId}`,
            url.searchParams
          );
        }
      }

      if (url.pathname.startsWith("/embed/")) {
        return withEmbedParams(url.toString(), url.searchParams);
      }
    }
  } catch (error) {
    console.warn("Failed to parse camera link:", error);
  }

  return withEmbedParams(link);
}

function withEmbedParams(url: string, originalParams?: URLSearchParams) {
  const embedUrl = new URL(url);
  if (originalParams?.has("list")) {
    embedUrl.searchParams.set("list", originalParams.get("list") ?? "");
  }
  if (originalParams?.has("index")) {
    embedUrl.searchParams.set("index", originalParams.get("index") ?? "");
  }
  embedUrl.searchParams.set("autoplay", "1");
  embedUrl.searchParams.set("mute", "1");
  embedUrl.searchParams.set("rel", "0");
  embedUrl.searchParams.set("playsinline", "1");
  return embedUrl.toString();
}
