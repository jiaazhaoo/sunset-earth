/**
 * 增强版客户端排名算法 v2
 *
 * 主要改进：
 * 1. 修正白天定义（日出前45分钟到日落后45分钟）
 * 2. 天气细分（light-snow vs heavy-snow, light-rain vs heavy-rain）
 * 3. Farpoint摄像头能见度加权（70%）
 * 4. 基于camera_metadata的动态评分
 * 5. 睡眠时间严格惩罚（0.05）
 * 6. 蓝调时刻天气影响降低（0.98）
 */

import type { CameraMetadata, CameraTier } from './camera-metadata-types';
import { parseCameraMetadata, getDefaultMetadata } from './camera-metadata-types';
import type { WeatherClassDetailed } from './weather-classification';
import { classifyWeatherDetailed, getWeatherWeight } from './weather-classification';

const MINUTE = 60 * 1000;

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

export type SolarEvent = {
  type: "sunrise" | "sunset";
  time: Date;
};

export type CameraEvaluation = {
  score: number;
  label?: string;
  distanceMinutes?: number;
  isClear: boolean;
  isDaytime?: boolean | null;
  weatherClass?: WeatherClassDetailed;
  nextEvent?: SolarEvent | null;
  followingEvent?: SolarEvent | null;
};

type ScoreOptions = {
  cameraMetadata?: CameraMetadata | null;
  sunsetDelayMinutes?: number;
  sunriseAdvanceMinutes?: number;
  timezone?: string;
  cameraTags?: string[];
};

/**
 * 主评分函数 - 计算摄像头在当前时间的分数
 */
export function scoreCameraWeather(
  weather: OpenMeteoResponse,
  now: Date,
  options: ScoreOptions = {}
): CameraEvaluation {
  const nowMs = now.getTime();
  const timezone = options.timezone || weather.timezone || 'UTC';
  const sunrise = pickClosestTime(weather.daily?.sunrise, nowMs, timezone);
  const sunset = pickClosestTime(weather.daily?.sunset, nowMs, timezone);

  // 使用扩展的白天定义：日出前45分钟到日落后45分钟
  const isDaytime = determineDaytimeExtended(sunrise, sunset, now);

  const hourIndex = getHourlyIndex(weather, now);
  const weatherCode = getHourlyValue(weather.hourly?.weathercode, hourIndex) ??
    weather.current_weather?.weathercode ?? null;
  const cloudcover = getHourlyValue(weather.hourly?.cloudcover, hourIndex);
  const humidity = getHourlyValue(weather.hourly?.relativehumidity_2m, hourIndex);
  const visibility = getHourlyValue(weather.hourly?.visibility, hourIndex);
  const precipitation = getHourlyValue(weather.hourly?.precipitation, hourIndex);
  const snowfall = getHourlyValue(weather.hourly?.snowfall, hourIndex);

  // 天气细分
  const weatherClass = classifyWeatherDetailed(weatherCode, precipitation, snowfall);
  const isClear = weatherClass === "clear";

  // 解析摄像头元数据
  const metadata = options.cameraMetadata ?? getDefaultMetadata();

  // 计算时间分层
  const timeTier = resolveTimeTier({
    sunrise,
    sunset,
    nowMs,
    isDaytime,
    isClear,
    metadata,
    sunsetDelayMinutes: Math.max(0, options.sunsetDelayMinutes ?? 0),
    sunriseAdvanceMinutes: Math.max(0, options.sunriseAdvanceMinutes ?? 0),
    cameraTags: options.cameraTags ?? [],
  });

  // 计算质量分数（Farpoint加权能见度）
  const qualityScore = buildQualityScoreEnhanced({
    visibility,
    humidity,
    precipitation,
    snowfall,
    cloudcover,
  }, metadata.isFarpoint);

  // 计算最终分数
  const score = calculateEnhancedScore({
    timeTier,
    weatherClass,
    qualityScore,
    isClear,
    isDaytime,
    metadata,
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

// ============================================================
// 时间分层系统
// ============================================================

type TimeTierResult = {
  tier: number;
  label: string;
  distanceMinutes?: number;
};

/**
 * 解析时间分层
 * 7层优先级系统
 */
function resolveTimeTier({
  sunrise,
  sunset,
  nowMs,
  isDaytime,
  isClear,
  metadata,
  sunsetDelayMinutes,
  sunriseAdvanceMinutes,
  cameraTags,
}: {
  sunrise: Date | null;
  sunset: Date | null;
  nowMs: number;
  isDaytime: boolean | null;
  isClear: boolean;
  metadata: CameraMetadata;
  sunsetDelayMinutes: number;
  sunriseAdvanceMinutes: number;
  cameraTags: string[];
}): TimeTierResult {
  const windows = buildWindows({
    sunrise,
    sunset,
    sunsetDelayMinutes,
    sunriseAdvanceMinutes,
  });

  // Tier 1: 黄金时刻核心（日出日落±30分钟）
  const goldenHour = findMatchingWindow(windows, nowMs, 1);
  if (goldenHour) {
    return goldenHour;
  }

  // Tier 2: 蓝调时刻
  // Coastline摄像头跳过蓝调时刻
  const isCoastline = cameraTags.includes('Coastline');
  if (!isCoastline) {
    const blueHour = findMatchingWindow(windows, nowMs, 2);
    if (blueHour) {
      return blueHour;
    }
  }

  // Tier 3: 扩展黄金时刻
  const extended = findMatchingWindow(windows, nowMs, 3);
  if (extended) {
    return extended;
  }

  // Tier 4: 白天（扩展定义：日出前45分钟到日落后45分钟）
  if (isDaytime) {
    return { tier: 4, label: "daytime", distanceMinutes: 999 };
  }

  // Tier 5: 城市天际线晴朗夜晚
  if (metadata.primaryType === 'city-skyline' && metadata.viewingTime.anytime && isClear) {
    return { tier: 5, label: "clear-night-skyline", distanceMinutes: 999 };
  }

  // Tier 6: 普通夜晚
  return { tier: 6, label: "night", distanceMinutes: 999 };
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

type WindowDefinition = {
  label: string;
  score: number;
  priority: number;
  startMs?: number;
  endMs?: number;
};

/**
 * 构建时间窗口
 */
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
      // 扩展黄金时刻（前）：日落前45-20分钟
      {
        label: "sunset-extended",
        score: 85,
        priority: 3,
        startMs: sunsetMs - 45 * MINUTE,
        endMs: sunsetMs - 20 * MINUTE,
      },
      // 黄金时刻核心：日落前20分钟 → 日落后15分钟（太阳高度角0-6度）
      {
        label: "sunset-primary",
        score: 100,
        priority: 1,
        startMs: sunsetMs - 20 * MINUTE,
        endMs: sunsetMs + 15 * MINUTE + delayMs,
      },
      // 蓝调时刻：日落后15-40分钟（民用曙暮光，太阳在地平线下4-8度）
      {
        label: "blue-hour-sunset",
        score: 95,
        priority: 2,
        startMs: sunsetMs + 15 * MINUTE + delayMs,
        endMs: sunsetMs + 40 * MINUTE + delayMs,
      },
      // 扩展黄金时刻（后）：蓝调后余晖，日落后40-60分钟
      {
        label: "sunset-extended-after",
        score: 85,
        priority: 3,
        startMs: sunsetMs + 40 * MINUTE + delayMs,
        endMs: sunsetMs + 60 * MINUTE + delayMs,
      }
    );
  }

  if (sunrise) {
    const sunriseMs = sunrise.getTime();
    const advanceMs = sunriseAdvanceMinutes * MINUTE;
    entries.push(
      // 扩展黄金时刻（前）：日出前60-40分钟（蓝调前的深蓝天空）
      {
        label: "sunrise-extended",
        score: 85,
        priority: 3,
        startMs: sunriseMs - 60 * MINUTE - advanceMs,
        endMs: sunriseMs - 40 * MINUTE - advanceMs,
      },
      // 蓝调时刻：日出前40-20分钟（民用曙暮光，太阳在地平线下4-8度）
      {
        label: "blue-hour-sunrise",
        score: 95,
        priority: 2,
        startMs: sunriseMs - 40 * MINUTE - advanceMs,
        endMs: sunriseMs - 20 * MINUTE - advanceMs,
      },
      // 黄金时刻核心：日出前20分钟 → 日出后20分钟（太阳高度角0-6度）
      {
        label: "sunrise-primary",
        score: 100,
        priority: 1,
        startMs: sunriseMs - 20 * MINUTE - advanceMs,
        endMs: sunriseMs + 20 * MINUTE,
      },
      // 扩展黄金时刻（后）：日出后20-45分钟
      {
        label: "sunrise-extended-after",
        score: 85,
        priority: 3,
        startMs: sunriseMs + 20 * MINUTE,
        endMs: sunriseMs + 45 * MINUTE,
      }
    );
  }

  return entries;
}

// ============================================================
// 白天判断
// ============================================================

/**
 * 扩展的白天定义：日出前45分钟到日落后45分钟
 */
function determineDaytimeExtended(
  sunrise: Date | null,
  sunset: Date | null,
  now: Date
): boolean | null {
  if (!sunrise || !sunset) {
    return null;
  }

  const nowMs = now.getTime();
  const dayStart = sunrise.getTime() - 45 * MINUTE;  // 日出前45分钟
  const dayEnd = sunset.getTime() + 45 * MINUTE;     // 日落后45分钟

  return nowMs >= dayStart && nowMs <= dayEnd;
}

// ============================================================
// 质量分数计算
// ============================================================

type QualityInputs = {
  visibility?: number;
  humidity?: number;
  precipitation?: number;
  snowfall?: number;
  cloudcover?: number;
};

const METRIC_LIMITS = {
  visibility: 20000,
  humidity: 100,
  precipitation: 2,
  snowfall: 1,
  cloudcover: 100,
} as const;

/**
 * 增强的质量分数计算
 * Farpoint摄像头：能见度占70%权重
 * 普通摄像头：5个指标平权
 */
function buildQualityScoreEnhanced(
  inputs: QualityInputs,
  isFarpoint: boolean
): number {
  if (isFarpoint) {
    // Farpoint：能见度占70%，其他指标占30%
    const visScore = normalizePositive(inputs.visibility, METRIC_LIMITS.visibility) ?? 0.5;

    const otherScores: number[] = [];
    const humidityScore = normalizeNegative(inputs.humidity, METRIC_LIMITS.humidity);
    const cloudScore = normalizeNegative(inputs.cloudcover, METRIC_LIMITS.cloudcover);

    if (humidityScore !== null) otherScores.push(humidityScore);
    if (cloudScore !== null) otherScores.push(cloudScore);

    const otherAvg = otherScores.length > 0
      ? otherScores.reduce((a, b) => a + b, 0) / otherScores.length
      : 0.5;

    return 0.7 * visScore + 0.3 * otherAvg;
  } else {
    // 普通摄像头：原有逻辑（5指标平权）
    const factors: number[] = [];

    const visScore = normalizePositive(inputs.visibility, METRIC_LIMITS.visibility);
    if (visScore !== null) factors.push(visScore);

    const humidityScore = normalizeNegative(inputs.humidity, METRIC_LIMITS.humidity);
    if (humidityScore !== null) factors.push(humidityScore);

    const precipScore = normalizeNegative(inputs.precipitation, METRIC_LIMITS.precipitation);
    if (precipScore !== null) factors.push(precipScore);

    const snowScore = normalizeNegative(inputs.snowfall, METRIC_LIMITS.snowfall);
    if (snowScore !== null) factors.push(snowScore);

    const cloudScore = normalizeNegative(inputs.cloudcover, METRIC_LIMITS.cloudcover);
    if (cloudScore !== null) factors.push(cloudScore);

    if (!factors.length) return 0.5;
    return factors.reduce((total, value) => total + value, 0) / factors.length;
  }
}

function normalizePositive(value: number | undefined, max: number) {
  if (value === undefined || value === null) return null;
  return clamp01(value / max);
}

function normalizeNegative(value: number | undefined, max: number) {
  if (value === undefined || value === null) return null;
  return clamp01(1 - value / max);
}

function clamp01(value: number) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

// ============================================================
// 增强评分计算
// ============================================================

type ScoreContext = {
  timeTier: TimeTierResult;
  weatherClass: WeatherClassDetailed;
  qualityScore: number;
  isClear: boolean;
  isDaytime: boolean | null;
  metadata: CameraMetadata;
  timezone: string;
  now: Date;
};

/**
 * 计算最终分数
 * 公式：最终分数 = 时间基础分 × 天气适配度 × 质量分数 × 特殊惩罚因子
 */
function calculateEnhancedScore(context: ScoreContext): number {
  const { timeTier, weatherClass, qualityScore, isClear, isDaytime, metadata, timezone, now } = context;

  // 时间基础分（0-100）
  const timeScores: Record<number, number> = {
    1: 100,  // 黄金时刻核心
    2: 95,   // 蓝调时刻
    3: 85,   // 扩展黄金时刻
    4: 70,   // 白天
    5: 70,   // 城市天际线晴朗夜晚 (从60提升到70)
    6: 30,   // 普通夜晚
  };

  const baseScore = timeScores[timeTier.tier] ?? 0;

  // 天气适配度（0-1）
  let weatherWeight = getWeatherWeight(weatherClass, metadata.weatherTolerance);

  // 动态调整天气权重
  if (timeTier.label === "blue-hour-sunset" || timeTier.label === "blue-hour-sunrise") {
    // 蓝调时刻：天气影响极小
    weatherWeight = isClear ? 1 : 0.98;
  } else if (timeTier.label === "sunset-primary" || timeTier.label === "sunrise-primary") {
    // 黄金时刻：partly-cloudy影响小
    if (weatherClass === "partly-cloudy") {
      weatherWeight = 0.9;
    }
  }

  // 质量分数调整（30%-100%）
  const adjustedQuality = 0.3 + 0.7 * qualityScore;

  // 特殊惩罚因子
  let specialPenalty = 1.0;

  // 1. 睡眠时间惩罚（22:00-06:00）
  if (metadata.viewingTime.noSleepTime && isLocalSleepTime(timezone, now)) {
    specialPenalty *= 0.05;  // "完全没法看"
  }

  // 2. Aurora白天归零
  if (metadata.primaryType === 'aurora' && isDaytime) {
    return 0;
  }

  // 3. 仅白天摄像头在夜晚降分
  if (metadata.viewingTime.dayOnly && !isDaytime) {
    specialPenalty *= 0.1;
  }

  // 4. 仅夜晚摄像头在白天降分
  if (metadata.viewingTime.nightOnly && isDaytime) {
    specialPenalty *= 0.1;
  }

  // 最终分数
  const finalScore = Math.round(baseScore * weatherWeight * adjustedQuality * specialPenalty);
  return Math.max(0, Math.min(100, finalScore));
}

/**
 * 判断是否在本地睡眠时间（22:00-06:00）
 */
function isLocalSleepTime(timezone: string, now: Date): boolean {
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

// ============================================================
// 辅助函数
// ============================================================

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

function pickClosestTime(times: string[] | undefined, targetMs: number, timezone?: string) {
  if (!times || times.length === 0) {
    return null;
  }

  let closest: Date | null = null;
  let bestDelta = Infinity;
  for (const value of times) {
    const parsed = parseDateInTimezone(value, timezone);
    if (!parsed) continue;
    const delta = Math.abs(parsed.getTime() - targetMs);
    if (delta < bestDelta) {
      closest = parsed;
      bestDelta = delta;
    }
  }
  return closest;
}

/**
 * Parse date string in a specific timezone
 *
 * Open-Meteo返回的日期格式：
 * - 带timezone参数：返回该时区的本地时间（如 "2025-12-19T16:28"）
 * - 这个时间字符串表示的是该时区的本地时间，不是UTC
 *
 * 例如："2025-12-19T16:28" + timezone="Asia/Tokyo" → 表示东京时间16:28
 *
 * @param value ISO8601日期字符串（本地时间，无时区后缀）
 * @param timezone IANA时区名称（如 "Asia/Tokyo"）
 */
function parseDateInTimezone(value: string | undefined | null, timezone?: string): Date | null {
  if (!value) return null;

  // 如果已经有时区信息（Z或+/-偏移），直接解析
  if (value.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  // 对于Open-Meteo返回的本地时间字符串（无时区后缀）
  // 策略：将本地时间字符串解释为指定时区的时间，然后转换为UTC Date对象
  if (timezone) {
    try {
      // 解析日期字符串的各个部分
      const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(value);
      if (!match) {
        return null;
      }

      const [, year, month, day, hour = '00', minute = '00', second = '00'] = match;

      // 构造一个时间字符串，表示目标时区的本地时间
      const localTimeStr = `${year}-${month}-${day}T${hour}:${minute}:${second}`;

      // 使用一个技巧：创建一个Date对象，然后通过Intl.DateTimeFormat获取时区偏移
      // 步骤1：假设这个时间是UTC时间，创建一个Date对象
      const utcDate = new Date(`${localTimeStr}Z`);

      // 步骤2：使用DateTimeFormat将这个UTC时间格式化为目标时区的本地时间
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZoneName: 'short',
      });

      // 步骤3：通过比较来计算时区偏移
      // 原理：如果原始字符串是"12:00"，我们希望它表示timezone的12:00
      // 我们创建了UTC的12:00，然后看这个UTC时间在timezone里显示为几点
      // 差值就是时区偏移

      // 创建一个参考时间：UTC 00:00
      const refUtc = new Date(`${year}-${month}-${day}T00:00:00Z`);
      const refFormatted = formatter.format(refUtc);

      // 从格式化的字符串中提取时间部分
      const refMatch = /(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s*(\d{1,2}):(\d{2}):(\d{2})/.exec(refFormatted);

      if (!refMatch) {
        // 无法解析，回退到添加Z的方式
        const fallbackDate = new Date(`${value}Z`);
        return Number.isNaN(fallbackDate.getTime()) ? null : fallbackDate;
      }

      const [, refMonth, refDay, refYear, refHour, refMin, refSec] = refMatch;
      const refLocal = new Date(
        Number.parseInt(refYear),
        Number.parseInt(refMonth) - 1,
        Number.parseInt(refDay),
        Number.parseInt(refHour),
        Number.parseInt(refMin),
        Number.parseInt(refSec)
      );

      // 计算偏移量（毫秒）
      const offset = refLocal.getTime() - refUtc.getTime();

      // 应用偏移：我们的本地时间 - 偏移 = UTC时间
      // 例如：东京12:00 - 9小时 = UTC 03:00
      const resultDate = new Date(utcDate.getTime() - offset);

      return Number.isNaN(resultDate.getTime()) ? null : resultDate;
    } catch (e) {
      console.error('[parseDateInTimezone] Error parsing date:', value, 'in timezone:', timezone, e);
      // 回退：假设是UTC
      const fallbackDate = new Date(`${value}Z`);
      return Number.isNaN(fallbackDate.getTime()) ? null : fallbackDate;
    }
  }

  // 如果没有时区信息，假设是UTC
  const date = new Date(value.endsWith('Z') ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * @deprecated Use parseDateInTimezone instead
 */
function parseUtcDate(value: string | undefined | null) {
  return parseDateInTimezone(value, undefined);
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
 * 查找最近的太阳事件（包括过去的事件）
 * 用于显示距离当前时间最近的日出或日落
 */
export function findClosestSolarEvents(
  weather: OpenMeteoResponse,
  now: Date,
  count: number,
  timezone?: string
): SolarEvent[] {
  const events: SolarEvent[] = [];
  const sunrises = weather.daily?.sunrise ?? [];
  const sunsets = weather.daily?.sunset ?? [];

  for (const entry of sunrises) {
    const date = parseDateInTimezone(entry, timezone);
    if (date) {
      events.push({ type: "sunrise", time: date });
    }
  }
  for (const entry of sunsets) {
    const date = parseDateInTimezone(entry, timezone);
    if (date) {
      events.push({ type: "sunset", time: date });
    }
  }

  if (!events.length) {
    return [];
  }

  const nowMs = now.getTime();

  // Sort by absolute distance from now
  const eventsWithDistance = events.map(event => ({
    event,
    distance: Math.abs(event.time.getTime() - nowMs)
  }));

  eventsWithDistance.sort((a, b) => a.distance - b.distance);

  return eventsWithDistance.slice(0, count).map(e => e.event);
}

/**
 * 排名摄像头
 *
 * 排序规则：
 * 1. 分数差距>1分：直接按分数排序
 * 2. 分数接近(差距≤1分)：美学tier打破平局 (t0 > t1 > t2 > t3)
 * 3. 距离黄金时刻：越接近越好
 * 4. 随机值：最终打破平局
 */
export function rankCameras(
  camerasWithEvaluations: Array<{
    camera: { camera_id: number };
    evaluation: CameraEvaluation;
    metadata?: CameraMetadata | null;
  }>
): Array<{
  camera: { camera_id: number };
  evaluation: CameraEvaluation;
}> {
  const tierOrder: Record<CameraTier, number> = {
    't0': 0,  // 特别美
    't1': 1,  // 很好看
    't2': 2,  // 还行
    't3': 3   // 一般
  };

  const itemsWithRandom = camerasWithEvaluations
    .filter((item) => item.evaluation.score > 0)
    .map((item) => ({
      ...item,
      randomValue: Math.random(),
    }));

  return itemsWithRandom.sort((a, b) => {
    // 1. 主排序：分数（差距>1分时直接按分数）
    const scoreDiff = b.evaluation.score - a.evaluation.score;
    if (Math.abs(scoreDiff) > 1) {
      return scoreDiff;
    }

    // 2. 分数接近（差距≤1分且不相等）：美学tier打破平局
    if (Math.abs(scoreDiff) <= 1 && scoreDiff !== 0) {
      const tierA = a.metadata?.tier ? tierOrder[a.metadata.tier] : 99;
      const tierB = b.metadata?.tier ? tierOrder[b.metadata.tier] : 99;
      if (tierA !== tierB) {
        return tierA - tierB;  // tier值越小越靠前 (t0 < t1 < t2 < t3)
      }
    }

    // 3. 次排序：距离黄金时刻中心升序
    const distA = a.evaluation.distanceMinutes ?? 999;
    const distB = b.evaluation.distanceMinutes ?? 999;
    if (Math.abs(distA - distB) > 0.1) {
      return distA - distB;
    }

    // 4. 随机值：最终打破平局
    return a.randomValue - b.randomValue;
  });
}
