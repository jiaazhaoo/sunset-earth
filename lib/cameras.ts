import { supabaseAdmin } from "@/lib/supabaseAdmin";

const CAMERA_COLUMNS =
  "camera_id,link,placename,city,country,latitude,longitude,timezone,info_0,tag,host_link,ytb_title,link_available";

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
};

export async function listCameras(limit = 200) {
  const { data, error } = await supabaseAdmin
    .from("camera_ytb")
    .select(CAMERA_COLUMNS)
    .limit(limit);

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
  const pool = await listCameras(50);
  if (!pool.length) {
    return null;
  }
  const randomIndex = Math.floor(Math.random() * pool.length);
  return pool[randomIndex];
}

function mapCameraRow(row: CameraRow): CameraRecord {
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
    lat: toNumber(row.latitude),
    lng: toNumber(row.longitude),
    timezone: row.timezone || null,
    city: row.city || null,
    country: row.country || null,
    tags: parseTags(row.tag),
    hostLink: row.host_link ?? null,
    ytbTitle: row.ytb_title ?? null,
    linkAvailable: row.link_available ?? true,
  };
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
      return withEmbedParams(`https://www.youtube.com/embed/${videoId}`);
    }

    if (host.includes("youtube.com")) {
      if (url.pathname === "/watch") {
        const videoId = url.searchParams.get("v");
        if (videoId) {
          return withEmbedParams(
            `https://www.youtube.com/embed/${videoId}`
          );
        }
      }

      if (url.pathname.startsWith("/live/")) {
        const videoId = url.pathname.split("/").pop();
        if (videoId) {
          return withEmbedParams(
            `https://www.youtube.com/embed/${videoId}`
          );
        }
      }

      if (url.pathname.startsWith("/embed/")) {
        return withEmbedParams(url.toString());
      }
    }
  } catch (error) {
    console.warn("Failed to parse camera link:", error);
  }

  return link;
}

function withEmbedParams(url: string) {
  const embedUrl = new URL(url);
  embedUrl.searchParams.set("autoplay", "1");
  embedUrl.searchParams.set("mute", "1");
  embedUrl.searchParams.set("rel", "0");
  embedUrl.searchParams.set("playsinline", "1");
  return embedUrl.toString();
}
