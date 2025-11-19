const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

type OpenMeteoResponse = {
  latitude: number;
  longitude: number;
  timezone: string;
  utc_offset_seconds: number;
  current_weather?: {
    time: string;
    weathercode: number;
  };
  hourly?: {
    time: string[];
    weathercode: number[];
    cloudcover: number[];
  };
  daily?: {
    time: string[];
    sunrise: string[];
    sunset: string[];
  };
};

type CachedEntry = {
  fetchedAt: number;
  data: OpenMeteoResponse;
};

type CameraWindowLabel =
  | "sunset-primary"
  | "sunrise-primary"
  | "sunset-extended"
  | "sunrise-extended"
  | "city-skyline"
  | "clear";

export type CameraEvaluation = {
  score: number;
  label?: CameraWindowLabel;
  distanceMinutes?: number;
  isClear: boolean;
};

const weatherCache = new Map<string, CachedEntry>();
const CLEAR_WEATHER_CODES = new Set([0, 1, 2]);

export async function fetchWeatherSnapshot(
  lat: number,
  lng: number
): Promise<OpenMeteoResponse> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const now = Date.now();
  const cached = weatherCache.get(key);
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  // serve stale while revalidating
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS * 2) {
    refreshWeatherSnapshot(key, lat, lng).catch((error) => {
      console.warn("[weather] background refresh failed", error);
    });
    return cached.data;
  }

  return refreshWeatherSnapshot(key, lat, lng);
}

async function refreshWeatherSnapshot(
  key: string,
  lat: number,
  lng: number
) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    hourly: "weathercode,cloudcover",
    daily: "sunrise,sunset",
    timezone: "UTC",
    forecast_days: "2",
    current_weather: "true",
  });

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(
        `${OPEN_METEO_URL}?${params.toString()}`,
        {
          headers: {
            "User-Agent": "SunsetEarth/1.0 contact@sunsetearth",
          },
          cache: "no-store",
        }
      );

      if (!response.ok) {
        if (response.status === 429 && attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          continue;
        }
        throw new Error(`Open-Meteo error: ${response.status}`);
      }

      const data = (await response.json()) as OpenMeteoResponse;
      weatherCache.set(key, { fetchedAt: Date.now(), data });
      return data;
    } catch (error) {
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        continue;
      }
      throw error;
    }
  }

  const cached = weatherCache.get(key);
  if (cached) {
    return cached.data;
  }
  throw new Error("Open-Meteo failed");
}

export function scoreCameraWeather(
  weather: OpenMeteoResponse,
  now: Date
): CameraEvaluation {
  const nowMs = now.getTime();
  const sunrise = pickClosestTime(weather.daily?.sunrise, nowMs);
  const sunset = pickClosestTime(weather.daily?.sunset, nowMs);

  const isClear = determineClearSky(weather, now);

  if (!sunrise && !sunset) {
    return {
      score: isClear ? 20 : 0,
      label: isClear ? "clear" : undefined,
      isClear,
    };
  }

  const windows = buildWindows({ sunrise, sunset, isClear });
  for (const window of windows) {
    if (!window.startMs || !window.endMs) {
      if (window.label === "clear" && isClear) {
        return {
          score: window.score,
          label: window.label,
          distanceMinutes: 999,
          isClear,
        };
      }
      continue;
    }
    if (nowMs >= window.startMs && nowMs <= window.endMs && isClear) {
      const center = (window.startMs + window.endMs) / 2;
      return {
        score: window.score,
        label: window.label,
        distanceMinutes: Math.abs(nowMs - center) / 60000,
        isClear,
      };
    }
  }

  return { score: isClear ? 30 : 0, label: isClear ? "clear" : undefined, isClear };
}

function determineClearSky(
  weather: OpenMeteoResponse,
  now: Date
): boolean {
  const hourIso = isoHourString(now);
  const hourlyTimes = weather.hourly?.time ?? [];
  const index = hourlyTimes.indexOf(hourIso);

  const code =
    index >= 0
      ? weather.hourly?.weathercode?.[index]
      : weather.current_weather?.weathercode;
  if (code !== undefined) {
    return CLEAR_WEATHER_CODES.has(code);
  }

  const cloudCover =
    index >= 0 ? weather.hourly?.cloudcover?.[index] : undefined;
  if (typeof cloudCover === "number") {
    return cloudCover <= 40;
  }

  return false;
}

function isoHourString(date: Date) {
  const clone = new Date(date);
  clone.setMinutes(0, 0, 0);
  return clone.toISOString().slice(0, 13) + ":00";
}

function pickClosestTime(times: string[] | undefined, targetMs: number) {
  if (!times || times.length === 0) {
    return null;
  }

  let closest: Date | null = null;
  let bestDelta = Infinity;
  for (const value of times) {
    const parsed = parseUtcDate(value);
    if (!parsed) continue;
    const delta = Math.abs(parsed.getTime() - targetMs);
    if (delta < bestDelta) {
      closest = parsed;
      bestDelta = delta;
    }
  }
  return closest;
}

function parseUtcDate(value: string | undefined | null) {
  if (!value) return null;
  const iso = value.endsWith("Z") ? value : `${value}Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

type WindowDefinition = {
  label: CameraWindowLabel;
  score: number;
  startMs?: number;
  endMs?: number;
};

function buildWindows({
  sunrise,
  sunset,
  isClear,
}: {
  sunrise: Date | null;
  sunset: Date | null;
  isClear: boolean;
}): WindowDefinition[] {
  const entries: WindowDefinition[] = [];

  if (sunset) {
    const sunsetMs = sunset.getTime();
    entries.push(
      {
        label: "sunset-primary",
        score: 100,
        startMs: sunsetMs - 60 * 60000,
        endMs: sunsetMs,
      },
      {
        label: "sunset-extended",
        score: 70,
        startMs: sunsetMs - 60 * 60000,
        endMs: sunsetMs + 30 * 60000,
      }
    );
  }

  if (sunrise) {
    const sunriseMs = sunrise.getTime();
    entries.push(
      {
        label: "sunrise-primary",
        score: 90,
        startMs: sunriseMs,
        endMs: sunriseMs + 90 * 60000,
      },
      {
        label: "sunrise-extended",
        score: 60,
        startMs: sunriseMs - 30 * 60000,
        endMs: sunriseMs + 90 * 60000,
      }
    );
  }

  entries.push({
    label: "clear",
    score: isClear ? 40 : 0,
  });

  return entries;
}
