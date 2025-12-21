import { supabaseAdmin } from "@/lib/supabaseAdmin";

const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export type OpenMeteoResponse = {
  latitude: number;
  longitude: number;
  timezone: string;
  utc_offset_seconds: number;
  current_weather?: {
    time: string;
    weathercode: number;
    is_day?: number;
  };
  hourly?: {
    time: string[];
    weathercode: number[];
    cloudcover: number[];
    relativehumidity_2m: number[];
    visibility: number[];
    precipitation: number[];
    snowfall: number[];
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
  | "city-skyline-night"
  | "clear"
  | "clear-day"
  | "night";

export type CameraEvaluation = {
  score: number;
  label?: CameraWindowLabel;
  distanceMinutes?: number;
  isClear: boolean;
  isDaytime?: boolean | null;
  weatherClass?: WeatherClass;
  nextEvent?: SolarEvent | null;
  followingEvent?: SolarEvent | null;
};

const weatherCache = new Map<string, CachedEntry>();
const MINUTE = 60 * 1000;

type WeatherClass =
  | "clear"
  | "partly-cloudy"
  | "cloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "freezing-rain"
  | "snow"
  | "snow-showers"
  | "thunderstorm"
  | "thunderstorm-hail";

const WEATHER_WEIGHTS: Record<WeatherClass, number> = {
  clear: 1,
  "partly-cloudy": 0.4,
  cloudy: 0.65,
  fog: 0.5,
  drizzle: 0.65,
  rain: 0.45,
  "freezing-rain": 0.35,
  snow: 0.65,
  "snow-showers": 0.6,
  thunderstorm: 0.25,
  "thunderstorm-hail": 0.2,
};

const METRIC_LIMITS = {
  visibility: 20000,
  humidity: 100,
  precipitation: 2,
  snowfall: 1,
  cloudcover: 100,
} as const;

const WEATHER_CACHE_TABLE = "camera_weather_cache";
const WEATHER_HISTORY_TABLE = "camera_weather_history";
const SUN_CACHE_TABLE = "camera_sun_cache";
const SUN_HISTORY_TABLE = "camera_sun_history";

export async function fetchWeatherSnapshot(
  lat: number,
  lng: number,
  cacheSlug?: string
): Promise<OpenMeteoResponse> {
  const key = cacheSlug ?? `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const now = Date.now();
  const cached = weatherCache.get(key);
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const persistent = await loadWeatherCache(key);
  if (persistent) {
    weatherCache.set(key, persistent);
    const age = now - persistent.fetchedAt;
    if (age < CACHE_TTL_MS) {
      return persistent.data;
    }
    if (age < CACHE_TTL_MS * 2) {
      refreshWeatherSnapshot(key, lat, lng).catch((error) => {
        console.warn("[weather] background refresh failed", error);
      });
      return persistent.data;
    }
  } else if (cached && now - cached.fetchedAt < CACHE_TTL_MS * 2) {
    refreshWeatherSnapshot(key, lat, lng).catch((error) => {
      console.warn("[weather] background refresh failed", error);
    });
    return cached.data;
  }

  return refreshWeatherSnapshot(key, lat, lng);
}

export async function getCachedWeatherSnapshot(
  cacheSlug: string
): Promise<OpenMeteoResponse | null> {
  const cached = weatherCache.get(cacheSlug);
  if (cached) {
    return cached.data;
  }
  const persistent = await loadWeatherCache(cacheSlug);
  return persistent?.data ?? null;
}

export async function getBulkCachedWeatherSnapshots(
  cameraSlugs: string[]
): Promise<Map<string, OpenMeteoResponse>> {
  const result = new Map<string, OpenMeteoResponse>();

  // First check in-memory cache
  const uncachedSlugs: string[] = [];
  for (const slug of cameraSlugs) {
    const cached = weatherCache.get(slug);
    if (cached) {
      result.set(slug, cached.data);
    } else {
      uncachedSlugs.push(slug);
    }
  }

  // Batch fetch from database for uncached items
  if (uncachedSlugs.length > 0) {
    try {
      const { data, error } = await supabaseAdmin
        .from(WEATHER_CACHE_TABLE)
        .select("camera_id,data,fetched_at")
        .in("camera_id", uncachedSlugs);

      if (!error && data) {
        for (const row of data) {
          const weatherData = row.data as OpenMeteoResponse;
          result.set(row.camera_id, weatherData);

          // Update in-memory cache
          const fetchedAt = new Date(row.fetched_at).getTime();
          weatherCache.set(row.camera_id, {
            fetchedAt,
            data: weatherData,
          });
        }
      }
    } catch (error) {
      console.warn("[weather] bulk load cache failed", error);
    }
  }

  return result;
}

async function refreshWeatherSnapshot(
  key: string,
  lat: number,
  lng: number
) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    hourly:
      "weathercode,cloudcover,relativehumidity_2m,visibility,precipitation,snowfall",
    daily: "sunrise,sunset",
    timezone: "auto",
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
      const entry = { fetchedAt: Date.now(), data };
      weatherCache.set(key, entry);
      persistWeatherCache(key, lat, lng, data).catch((error) => {
        console.warn("[weather] failed to persist cache", error);
      });
      persistWeatherHistory(key, lat, lng, data).catch((error) => {
        console.warn("[weather] failed to persist history", error);
      });
      persistSunData(key, lat, lng, data).catch((error) => {
        console.warn("[weather] failed to persist sun data", error);
      });
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

type ScoreOptions = {
  hasCitySkyline?: boolean;
  sunsetDelayMinutes?: number;
  sunriseAdvanceMinutes?: number;
};

type SolarEvent = {
  type: "sunrise" | "sunset";
  time: Date;
};

export function scoreCameraWeather(
  weather: OpenMeteoResponse,
  now: Date,
  options: ScoreOptions = {}
): CameraEvaluation {
  const nowMs = now.getTime();
  const sunrise = pickClosestTime(weather.daily?.sunrise, nowMs);
  const sunset = pickClosestTime(weather.daily?.sunset, nowMs);
  const isDaytime = determineDaytime(weather, now);
  const hourIndex = getHourlyIndex(weather, now);

  const weatherCode =
    getHourlyValue(weather.hourly?.weathercode, hourIndex) ??
    weather.current_weather?.weathercode ??
    null;
  const cloudcover = getHourlyValue(weather.hourly?.cloudcover, hourIndex);
  const humidity = getHourlyValue(
    weather.hourly?.relativehumidity_2m,
    hourIndex
  );
  const visibility = getHourlyValue(weather.hourly?.visibility, hourIndex);
  const precipitation = getHourlyValue(
    weather.hourly?.precipitation,
    hourIndex
  );
  const snowfall = getHourlyValue(weather.hourly?.snowfall, hourIndex);

  const weatherClass = classifyWeather(weatherCode);
  const isClear = weatherClass === "clear";

  const timeTier = resolveTimeTier({
    sunrise,
    sunset,
    nowMs,
    isDaytime,
    isClear,
    hasCitySkyline: options.hasCitySkyline ?? false,
    sunsetDelayMinutes: Math.max(0, options.sunsetDelayMinutes ?? 0),
    sunriseAdvanceMinutes: Math.max(0, options.sunriseAdvanceMinutes ?? 0),
  });

  const qualityScore = buildQualityScore({
    visibility,
    humidity,
    precipitation,
    snowfall,
    cloudcover,
  });

  const timeWeights: Record<number, number> = {
    1: 100,
    2: 85,
    3: 65,
    4: 45,
    5: 20,
  };

  const weatherWeight = WEATHER_WEIGHTS[weatherClass];
  const baseScore = timeWeights[timeTier.tier] ?? 0;
  const adjustedQuality = 0.4 + 0.6 * qualityScore;
  const score = Math.round(baseScore * weatherWeight * adjustedQuality);
  const upcomingEvents = findUpcomingSolarEvents(weather, now, 2);
  const nextEvent = upcomingEvents[0] ?? null;
  const followingEvent = upcomingEvents[1] ?? null;

  return {
    score,
    label: timeTier.label,
    distanceMinutes: timeTier.distanceMinutes,
    isClear,
    isDaytime,
    weatherClass,
    nextEvent,
    followingEvent,
  };
}

function isoHourString(date: Date) {
  const clone = new Date(date);
  clone.setMinutes(0, 0, 0);
  return clone.toISOString().slice(0, 13) + ":00";
}

function getHourlyIndex(weather: OpenMeteoResponse, now: Date) {
  const hourIso = isoHourString(now);
  const hourlyTimes = weather.hourly?.time ?? [];
  const index = hourlyTimes.indexOf(hourIso);
  return index >= 0 ? index : null;
}

function getHourlyValue(
  values: number[] | undefined,
  index: number | null
): number | undefined {
  if (index === null || !values || index < 0 || index >= values.length) {
    return undefined;
  }
  return values[index];
}

function classifyWeather(code: number | null): WeatherClass {
  switch (code) {
    case 0:
    case 1:
      return "clear";
    case 2:
      return "partly-cloudy";
    case 3:
      return "cloudy";
    case 45:
    case 48:
      return "fog";
    case 51:
    case 53:
    case 55:
      return "drizzle";
    case 56:
    case 57:
      return "freezing-rain";
    case 61:
    case 63:
    case 65:
    case 80:
    case 81:
    case 82:
      return "rain";
    case 66:
    case 67:
      return "freezing-rain";
    case 71:
    case 73:
    case 75:
    case 77:
      return "snow";
    case 85:
    case 86:
      return "snow-showers";
    case 95:
      return "thunderstorm";
    case 96:
    case 99:
      return "thunderstorm-hail";
    default:
      return "cloudy"; // fallback without returning "other"
  }
}

type TimeTierResult = {
  tier: number;
  label: CameraWindowLabel;
  distanceMinutes?: number;
};

function resolveTimeTier({
  sunrise,
  sunset,
  nowMs,
  isDaytime,
  isClear,
  hasCitySkyline,
  sunsetDelayMinutes,
  sunriseAdvanceMinutes,
}: {
  sunrise: Date | null;
  sunset: Date | null;
  nowMs: number;
  isDaytime: boolean | null;
  isClear: boolean;
  hasCitySkyline: boolean;
  sunsetDelayMinutes: number;
  sunriseAdvanceMinutes: number;
}): TimeTierResult {
  const windows = buildWindows({
    sunrise,
    sunset,
    sunsetDelayMinutes,
    sunriseAdvanceMinutes,
  });
  const primary = findMatchingWindow(windows, nowMs, 1);
  if (primary) {
    return primary;
  }
  const extended = findMatchingWindow(windows, nowMs, 2);
  if (extended) {
    return extended;
  }

  if (isDaytime) {
    return { tier: 3, label: "clear-day", distanceMinutes: 999 };
  }

  if (!isDaytime && hasCitySkyline && isClear) {
    return { tier: 4, label: "city-skyline-night", distanceMinutes: 999 };
  }

  return { tier: 5, label: "night", distanceMinutes: 999 };
}

function findMatchingWindow(
  windows: WindowDefinition[],
  nowMs: number,
  priority: number
): TimeTierResult | null {
  const target = windows.find(
    (window) =>
      window.priority === priority &&
      window.startMs !== undefined &&
      window.endMs !== undefined &&
      nowMs >= window.startMs &&
      nowMs <= window.endMs
  );
  if (!target || !target.startMs || !target.endMs) {
    return null;
  }
  const center = (target.startMs + target.endMs) / 2;
  return {
    tier: priority,
    label: target.label,
    distanceMinutes: Math.abs(nowMs - center) / MINUTE,
  };
}

type QualityInputs = {
  visibility?: number;
  humidity?: number;
  precipitation?: number;
  snowfall?: number;
  cloudcover?: number;
};

function buildQualityScore(inputs: QualityInputs): number {
  const factors: number[] = [];
  const visScore = normalizePositive(
    inputs.visibility,
    METRIC_LIMITS.visibility
  );
  if (visScore !== null) {
    factors.push(visScore);
  }

  const humidityScore = normalizeNegative(
    inputs.humidity,
    METRIC_LIMITS.humidity
  );
  if (humidityScore !== null) {
    factors.push(humidityScore);
  }

  const precipScore = normalizeNegative(
    inputs.precipitation,
    METRIC_LIMITS.precipitation
  );
  if (precipScore !== null) {
    factors.push(precipScore);
  }

  const snowScore = normalizeNegative(
    inputs.snowfall,
    METRIC_LIMITS.snowfall
  );
  if (snowScore !== null) {
    factors.push(snowScore);
  }

  const cloudScore = normalizeNegative(
    inputs.cloudcover,
    METRIC_LIMITS.cloudcover
  );
  if (cloudScore !== null) {
    factors.push(cloudScore);
  }

  if (!factors.length) {
    return 0.5;
  }
  const sum = factors.reduce((total, value) => total + value, 0);
  return sum / factors.length;
}

function normalizePositive(value: number | undefined, max: number) {
  if (value === undefined || value === null) {
    return null;
  }
  return clamp01(value / max);
}

function normalizeNegative(value: number | undefined, max: number) {
  if (value === undefined || value === null) {
    return null;
  }
  return clamp01(1 - value / max);
}

function clamp01(value: number) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

async function loadWeatherCache(key: string): Promise<CachedEntry | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from(WEATHER_CACHE_TABLE)
      .select("data,fetched_at")
      .eq("camera_id", key)
      .maybeSingle();
    if (error || !data) {
      return null;
    }
    const fetchedAt = new Date(data.fetched_at).getTime();
    return {
      fetchedAt,
      data: data.data as OpenMeteoResponse,
    };
  } catch (error) {
    console.warn("[weather] load cache failed", error);
    return null;
  }
}

async function persistWeatherCache(
  key: string,
  lat: number,
  lng: number,
  data: OpenMeteoResponse
) {
  try {
    await supabaseAdmin.from(WEATHER_CACHE_TABLE).upsert(
      {
        camera_id: key,
        lat,
        lng,
        data,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "camera_id" }
    );
  } catch (error) {
    console.warn("[weather] persist cache failed", error);
  }
}

async function persistWeatherHistory(
  key: string,
  lat: number,
  lng: number,
  data: OpenMeteoResponse
) {
  try {
    await supabaseAdmin.from(WEATHER_HISTORY_TABLE).insert({
      camera_id: key,
      lat,
      lng,
      data,
      fetched_at: new Date().toISOString(),
    });
  } catch (error) {
    console.warn("[weather] persist history failed", error);
  }
}

async function persistSunData(
  key: string,
  lat: number,
  lng: number,
  data: OpenMeteoResponse
) {
  const sunriseValue = data.daily?.sunrise?.[0] ?? null;
  const sunsetValue = data.daily?.sunset?.[0] ?? null;
  const payload = {
    sunrise: data.daily?.sunrise ?? [],
    sunset: data.daily?.sunset ?? [],
  };
  try {
    await supabaseAdmin.from(SUN_CACHE_TABLE).upsert(
      {
        camera_id: key,
        lat,
        lng,
        sunrise: sunriseValue ? toIsoDate(sunriseValue) : null,
        sunset: sunsetValue ? toIsoDate(sunsetValue) : null,
        data: payload,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "camera_id" }
    );
  } catch (error) {
    console.warn("[weather] persist sun cache failed", error);
  }

  try {
    await supabaseAdmin.from(SUN_HISTORY_TABLE).insert({
      camera_id: key,
      lat,
      lng,
      sunrise: sunriseValue ? toIsoDate(sunriseValue) : null,
      sunset: sunsetValue ? toIsoDate(sunsetValue) : null,
      data: payload,
      fetched_at: new Date().toISOString(),
    });
  } catch (error) {
    console.warn("[weather] persist sun history failed", error);
  }
}

function toIsoDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
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
  priority: number;
  startMs?: number;
  endMs?: number;
};

function buildWindows({
  sunrise,
  sunset,
  sunsetDelayMinutes,
  sunriseAdvanceMinutes,
}: {
  sunrise: Date | null;
  sunset: Date | null;
  sunsetDelayMinutes: number;
  sunriseAdvanceMinutes: number;
}): WindowDefinition[] {
  const entries: WindowDefinition[] = [];

  if (sunset) {
    const sunsetMs = sunset.getTime();
    const delayMs = sunsetDelayMinutes * MINUTE;
    entries.push(
      {
        label: "sunset-primary",
        score: 100,
        priority: 1,
        startMs: sunsetMs - 60 * MINUTE,
        endMs: sunsetMs + 5 * MINUTE + delayMs,
      },
      {
        label: "sunset-extended",
        score: 80,
        priority: 2,
        startMs: sunsetMs - 90 * MINUTE,
        endMs: sunsetMs + 10 * MINUTE + delayMs,
      }
    );
  }

  if (sunrise) {
    const sunriseMs = sunrise.getTime();
    const advanceMs = sunriseAdvanceMinutes * MINUTE;
    entries.push(
      {
        label: "sunrise-primary",
        score: 100,
        priority: 1,
        startMs: sunriseMs - 15 * MINUTE - advanceMs,
        endMs: sunriseMs + 60 * MINUTE,
      },
      {
        label: "sunrise-extended",
        score: 80,
        priority: 2,
        startMs: sunriseMs - 30 * MINUTE - advanceMs,
        endMs: sunriseMs + 90 * MINUTE,
      }
    );
  }

  return entries;
}

function determineDaytime(weather: OpenMeteoResponse, now: Date) {
  const nowMs = now.getTime();
  const sunrises = weather.daily?.sunrise ?? [];
  const sunsets = weather.daily?.sunset ?? [];
  const length = Math.min(sunrises.length, sunsets.length);
  for (let i = 0; i < length; i++) {
    const sunrise = parseUtcDate(sunrises[i]);
    const sunset = parseUtcDate(sunsets[i]);
    if (!sunrise || !sunset) continue;
    const start = sunrise.getTime();
    const end = sunset.getTime();
    if (start <= nowMs && nowMs <= end) {
      return true;
    }
  }
  const isDay = weather.current_weather?.is_day;
  if (typeof isDay === "number") {
    return isDay === 1;
  }
  return null;
}

function findUpcomingSolarEvents(
  weather: OpenMeteoResponse,
  now: Date,
  count: number
): SolarEvent[] {
  const events: SolarEvent[] = [];
  const sunrises = weather.daily?.sunrise ?? [];
  const sunsets = weather.daily?.sunset ?? [];

  for (const entry of sunrises) {
    const date = parseUtcDate(entry);
    if (date) {
      events.push({ type: "sunrise", time: date });
    }
  }
  for (const entry of sunsets) {
    const date = parseUtcDate(entry);
    if (date) {
      events.push({ type: "sunset", time: date });
    }
  }

  if (!events.length) {
    return [];
  }

  events.sort((a, b) => a.time.getTime() - b.time.getTime());
  const nowMs = now.getTime();
  const future = events.filter((event) => event.time.getTime() >= nowMs);

  if (future.length >= count) {
    return future.slice(0, count);
  }

  const DAY_MS = 24 * 60 * 60 * 1000;
  const result = [...future];
  let pointer = 0;
  while (result.length < count) {
    const base = events[pointer % events.length];
    const lastTime = result.length
      ? result[result.length - 1].time.getTime()
      : nowMs;
    let candidate = base.time.getTime();
    while (candidate <= lastTime) {
      candidate += DAY_MS;
    }
    result.push({ type: base.type, time: new Date(candidate) });
    pointer++;
    if (pointer > events.length * 4) {
      break;
    }
  }

  return result.slice(0, count);
}
