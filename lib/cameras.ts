import tzLookup from "tz-lookup";
import { query, queryOne, placeholders, toBool, parseJson } from "@/lib/db";

const CAMERA_COLUMNS =
  "camera_id,link,placename,city,country,latitude,longitude,timezone,info_0,tag,host_link,ytb_title,link_available,sunset_delay,sunrise_advance,last_check,camera_metadata";

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
  /** SQLite stores booleans as INTEGER 0/1. */
  link_available: number | boolean | null;
  sunset_delay: number | string | null;
  sunrise_advance: number | string | null;
  last_check: string | null;
  /** SQLite stores JSON as TEXT. */
  camera_metadata: string | null;
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
  metadata: any;
};

export async function listCameras(limit = 200, offset = 0) {
  const rows = await query<CameraRow>(
    `SELECT ${CAMERA_COLUMNS} FROM camera_ytb
     ORDER BY camera_id
     LIMIT ? OFFSET ?`,
    limit,
    offset
  );

  return rows.map(mapCameraRow);
}

export async function getCameraById(cameraId: string) {
  const row = await queryOne<CameraRow>(
    `SELECT ${CAMERA_COLUMNS} FROM camera_ytb WHERE camera_id = ?`,
    cameraId
  );

  return row ? mapCameraRow(row) : null;
}

export async function getCameraTagsMap(cameraIds: string[]): Promise<Map<string, string[]>> {
  const tagsMap = new Map<string, string[]>();

  const slots = placeholders(cameraIds.length);
  if (!slots) {
    return tagsMap;
  }

  const rows = await query<{ camera_id: string; tag: string | null }>(
    `SELECT camera_id, tag FROM camera_ytb WHERE camera_id IN (${slots})`,
    ...cameraIds
  );

  for (const row of rows) {
    tagsMap.set(String(row.camera_id), parseTags(row.tag));
  }

  return tagsMap;
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
    linkAvailable: toBool(row.link_available, true),
    sunsetDelay: toNumber(row.sunset_delay) ?? 0,
    sunriseAdvance: toNumber(row.sunrise_advance) ?? 0,
    lastCheck: row.last_check ?? null,
    metadata: parseJson(row.camera_metadata),
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
