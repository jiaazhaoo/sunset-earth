/**
 * Client-side camera ranking utilities
 * This module contains all the logic for scoring and ranking cameras based on weather conditions
 * Previously this logic lived in the backend compute-rankings cron job
 */

import type { CameraRecord } from "@/lib/cameras";

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

// Base weather weights - will be adjusted based on camera type and time
const WEATHER_WEIGHTS: Record<WeatherClass, number> = {
  clear: 1,
  "partly-cloudy": 0.85, // Increased: doesn't affect sunset/sunrise much
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

type CameraWindowLabel =
  | "sunset-primary"
  | "sunrise-primary"
  | "sunset-extended"
  | "sunset-extended-after"
  | "sunrise-extended"
  | "blue-hour-sunset"
  | "blue-hour-sunrise"
  | "approaching-sunset"
  | "approaching-sunrise"
  | "after-sunrise"
  | "city-skyline-night"
  | "street-day"
  | "street-night"
  | "clear-day"
  | "night";

export type SolarEvent = {
  type: "sunrise" | "sunset";
  time: Date;
};

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

type ScoreOptions = {
  hasCitySkyline?: boolean;
  sunsetDelayMinutes?: number;
  sunriseAdvanceMinutes?: number;
  cameraType?: CameraType;
  tags?: string[];
  timezone?: string;
};

type CameraType = "street" | "city-skyline" | "nature" | "railway" | "beach" | "harbour" | "ski-resort" | "general";

function identifyCameraType(tags?: string[]): CameraType {
  if (!tags || tags.length === 0) return "general";

  const tagStr = tags.join(" ").toLowerCase();

  if (tagStr.includes("ski") || tagStr.includes("snow resort") || tagStr.includes("skiing")) {
    return "ski-resort";
  }
  if (tagStr.includes("street") || tagStr.includes("downtown") || tagStr.includes("plaza")) {
    return "street";
  }
  if (tagStr.includes("city skyline") || tagStr.includes("skyline")) {
    return "city-skyline";
  }
  if (tagStr.includes("railway") || tagStr.includes("train") || tagStr.includes("station")) {
    return "railway";
  }
  if (tagStr.includes("beach") || tagStr.includes("shore")) {
    return "beach";
  }
  if (tagStr.includes("harbour") || tagStr.includes("harbor") || tagStr.includes("port")) {
    return "harbour";
  }
  if (tagStr.includes("nature") || tagStr.includes("mountain") || tagStr.includes("forest") || tagStr.includes("landscape")) {
    return "nature";
  }

  return "general";
}

/**
 * Determine if the local time at a timezone is within typical sleep hours (22:00-06:00)
 */
function isLocalSleepTime(timezone: string | null, now: Date): boolean {
  if (!timezone) return false;

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false
    });
    const parts = formatter.formatToParts(now);
    const hourPart = parts.find(p => p.type === 'hour');
    if (!hourPart) return false;

    const hour = Number.parseInt(hourPart.value, 10);
    return hour >= 22 || hour < 6; // 22:00 - 06:00
  } catch (e) {
    console.warn('[isLocalSleepTime] Failed to determine sleep time:', e);
    return false;
  }
}

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
  const hasRain = (precipitation ?? 0) > 0.1;

  // Identify camera type from tags
  const cameraType = options.cameraType ?? identifyCameraType(options.tags);

  const timeTier = resolveTimeTier({
    sunrise,
    sunset,
    nowMs,
    isDaytime,
    isClear,
    cameraType,
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

  // NEW: Enhanced scoring system
  const score = calculateEnhancedScore({
    timeTier,
    weatherClass,
    qualityScore,
    isClear,
    hasRain,
    isDaytime,
    cameraType,
    timezone: options.timezone ?? weather.timezone,
    now,
  });

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

type ScoreContext = {
  timeTier: TimeTierResult;
  weatherClass: WeatherClass;
  qualityScore: number;
  isClear: boolean;
  hasRain: boolean;
  isDaytime: boolean | null;
  cameraType: CameraType;
  timezone?: string;
  now?: Date;
};

function calculateEnhancedScore(context: ScoreContext): number {
  const { timeTier, weatherClass, qualityScore, isClear, hasRain, cameraType, isDaytime, timezone, now } = context;

  // Base scores by time period
  const timeScores: Record<number, number> = {
    1: 100, // Golden hour (sunset/sunrise primary)
    2: 90,  // Blue hour
    3: 85,  // Extended golden hour
    4: 70,  // Street view (day/night)
    5: 60,  // Clear day
    6: 50,  // City skyline night
    7: 25,  // Regular night
  };

  const baseScore = timeScores[timeTier.tier] ?? 0;

  // Weather impact varies by camera type and time
  let weatherWeight = 1;

  if (timeTier.label === "sunset-primary" || timeTier.label === "sunrise-primary") {
    // Golden hour: partly-cloudy is fine, but rain/heavy clouds reduce score
    if (weatherClass === "clear") weatherWeight = 1;
    else if (weatherClass === "partly-cloudy") weatherWeight = 0.9; // Only slight reduction
    else if (weatherClass === "snow" || weatherClass === "snow-showers") weatherWeight = 0.75;
    else weatherWeight = 0.5;
  } else if (timeTier.label === "blue-hour-sunset" || timeTier.label === "blue-hour-sunrise") {
    // Blue hour: weather doesn't matter much
    weatherWeight = weatherClass === "clear" ? 1 : 0.95;
  } else if (timeTier.label === "street-day" || timeTier.label === "street-night") {
    // Street views: tolerant to weather, just avoid heavy rain
    weatherWeight = hasRain ? 0.85 : 1;
  } else if (timeTier.label === "city-skyline-night") {
    // City skyline: needs clear weather
    if (cameraType === "city-skyline") {
      if (isClear) weatherWeight = 1;
      else if (weatherClass === "partly-cloudy") weatherWeight = 0.7;
      else if (hasRain) weatherWeight = 0.3; // Rain is very bad for city skylines
      else weatherWeight = 0.5;
    }
  } else if (timeTier.label?.includes("extended")) {
    // Extended golden hour: partly-cloudy is acceptable, but not as good as clear
    if (weatherClass === "clear") weatherWeight = 1;
    else if (weatherClass === "partly-cloudy") weatherWeight = 0.85;
    else if (weatherClass === "snow" || weatherClass === "snow-showers") weatherWeight = 0.7;
    else weatherWeight = 0.4;
  } else if (timeTier.label?.includes("approaching") || timeTier.label?.includes("after")) {
    // Approaching/after golden hour: clear weather preferred
    if (weatherClass === "clear") weatherWeight = 1;
    else if (weatherClass === "partly-cloudy") weatherWeight = 0.8;
    else weatherWeight = 0.5;
  } else if (timeTier.label === "clear-day") {
    // Day time: street views get boost, nature/beach/harbour need good weather
    if (cameraType === "street" || cameraType === "railway") {
      weatherWeight = hasRain ? 0.85 : 1; // Street/railway tolerant to weather
    } else if (cameraType === "city-skyline") {
      weatherWeight = isClear ? 1 : (weatherClass === "partly-cloudy" ? 0.8 : 0.5);
    } else {
      // Nature, beach, harbour - need better weather
      weatherWeight = WEATHER_WEIGHTS[weatherClass];
    }
  } else if (timeTier.label === "night") {
    // Night time: handle ski-resort sleep time specially
    if (cameraType === "ski-resort" && now && timezone) {
      if (isLocalSleepTime(timezone, now)) {
        weatherWeight = 0.1; // Very low score during sleep hours
      } else {
        weatherWeight = isClear ? 1 : 0.8; // Ski resort at night (non-sleep) is good
      }
    } else if (cameraType === "nature" || cameraType === "beach" || cameraType === "harbour") {
      weatherWeight = 0.2; // Very low score for nature at night
    } else if (cameraType === "street" || cameraType === "railway") {
      weatherWeight = hasRain ? 0.8 : 1; // Street still good at night
    } else {
      weatherWeight = WEATHER_WEIGHTS[weatherClass];
    }
  } else {
    // Default weather weighting
    weatherWeight = WEATHER_WEIGHTS[weatherClass];
  }

  // Quality score has more impact now
  const adjustedQuality = 0.3 + 0.7 * qualityScore;

  // Add distance bonus for golden hour
  let distanceBonus = 0;
  if (timeTier.tier === 1 && timeTier.distanceMinutes !== undefined && timeTier.distanceMinutes < 999) {
    // Closer to the center of golden hour = higher score (within 30 min window)
    distanceBonus = Math.max(0, 10 * (1 - timeTier.distanceMinutes / 30));
  }

  const finalScore = Math.round((baseScore + distanceBonus) * weatherWeight * adjustedQuality);
  return Math.max(0, Math.min(100, finalScore));
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
  cameraType,
  sunsetDelayMinutes,
  sunriseAdvanceMinutes,
}: {
  sunrise: Date | null;
  sunset: Date | null;
  nowMs: number;
  isDaytime: boolean | null;
  isClear: boolean;
  cameraType: CameraType;
  sunsetDelayMinutes: number;
  sunriseAdvanceMinutes: number;
}): TimeTierResult {
  const windows = buildWindows({
    sunrise,
    sunset,
    sunsetDelayMinutes,
    sunriseAdvanceMinutes,
  });

  // Priority 1: Golden hour (sunset/sunrise primary)
  const primary = findMatchingWindow(windows, nowMs, 1);
  if (primary) {
    return primary;
  }

  // Priority 2: Blue hour
  const blueHour = findMatchingWindow(windows, nowMs, 2);
  if (blueHour) {
    return blueHour;
  }

  // Priority 3: Extended golden hour
  const extended = findMatchingWindow(windows, nowMs, 3);
  if (extended) {
    return extended;
  }

  // Priority 4: Street views (day or night)
  if (cameraType === "street" || cameraType === "railway") {
    if (isDaytime) {
      return { tier: 4, label: "street-day", distanceMinutes: 999 };
    } else {
      return { tier: 4, label: "street-night", distanceMinutes: 999 };
    }
  }

  // Priority 5: Clear day
  if (isDaytime) {
    return { tier: 5, label: "clear-day", distanceMinutes: 999 };
  }

  // Priority 6: City skyline at night (clear weather)
  if (cameraType === "city-skyline" && isClear) {
    return { tier: 6, label: "city-skyline-night", distanceMinutes: 999 };
  }

  // Priority 7: Regular night
  return { tier: 7, label: "night", distanceMinutes: 999 };
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
      // Approaching sunset (2 hours before, to 60 min before)
      {
        label: "approaching-sunset",
        score: 70,
        priority: 4,
        startMs: sunsetMs - 120 * MINUTE,
        endMs: sunsetMs - 60 * MINUTE,
      },
      // Extended golden hour (60-30 min before)
      {
        label: "sunset-extended",
        score: 85,
        priority: 3,
        startMs: sunsetMs - 60 * MINUTE,
        endMs: sunsetMs - 30 * MINUTE,
      },
      // Core golden hour (30 min before to 30 min after)
      {
        label: "sunset-primary",
        score: 100,
        priority: 1,
        startMs: sunsetMs - 30 * MINUTE,
        endMs: sunsetMs + 30 * MINUTE + delayMs,
      },
      // Extended golden hour after (30-60 min after)
      {
        label: "sunset-extended-after",
        score: 85,
        priority: 3,
        startMs: sunsetMs + 30 * MINUTE + delayMs,
        endMs: sunsetMs + 60 * MINUTE + delayMs,
      },
      // Blue hour (60-90 min after sunset)
      {
        label: "blue-hour-sunset",
        score: 90,
        priority: 2,
        startMs: sunsetMs + 60 * MINUTE + delayMs,
        endMs: sunsetMs + 90 * MINUTE + delayMs,
      }
    );
  }

  if (sunrise) {
    const sunriseMs = sunrise.getTime();
    const advanceMs = sunriseAdvanceMinutes * MINUTE;
    entries.push(
      // Blue hour (90-60 min before sunrise)
      {
        label: "blue-hour-sunrise",
        score: 90,
        priority: 2,
        startMs: sunriseMs - 90 * MINUTE - advanceMs,
        endMs: sunriseMs - 60 * MINUTE - advanceMs,
      },
      // Approaching sunrise (60 min before to 30 min before, adjusted for advance)
      {
        label: "approaching-sunrise",
        score: 70,
        priority: 4,
        startMs: sunriseMs - 60 * MINUTE - advanceMs,
        endMs: sunriseMs - 30 * MINUTE - advanceMs,
      },
      // Core golden hour (30 min before to 30 min after)
      {
        label: "sunrise-primary",
        score: 100,
        priority: 1,
        startMs: sunriseMs - 30 * MINUTE - advanceMs,
        endMs: sunriseMs + 30 * MINUTE,
      },
      // Extended golden hour (30-60 min after)
      {
        label: "sunrise-extended",
        score: 85,
        priority: 3,
        startMs: sunriseMs + 30 * MINUTE,
        endMs: sunriseMs + 60 * MINUTE,
      },
      // After sunrise (60-120 min after)
      {
        label: "after-sunrise",
        score: 70,
        priority: 4,
        startMs: sunriseMs + 60 * MINUTE,
        endMs: sunriseMs + 120 * MINUTE,
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

/**
 * Rank cameras by their scores and return them in descending order
 */
export function rankCameras(
  camerasWithEvaluations: Array<{
    camera: CameraRecord;
    evaluation: CameraEvaluation;
  }>
): Array<{
  camera: CameraRecord;
  evaluation: CameraEvaluation;
}> {
  // Attach random values for tie-breaking
  const itemsWithRandom = camerasWithEvaluations
    .filter((item) => item.evaluation.score > 0)
    .map((item) => ({
      ...item,
      randomValue: Math.random(),
    }));

  return itemsWithRandom.sort((a, b) => {
    // Primary sort: by score (descending)
    if (b.evaluation.score !== a.evaluation.score) {
      return b.evaluation.score - a.evaluation.score;
    }
    // Secondary sort: by distance to golden hour (ascending)
    const distA = a.evaluation.distanceMinutes ?? 999;
    const distB = b.evaluation.distanceMinutes ?? 999;
    if (Math.abs(distA - distB) > 0.1) {
      return distA - distB;
    }
    // Tertiary sort: random (for cameras with identical score and distance)
    return a.randomValue - b.randomValue;
  });
}
