/**
 * Camera Pool System
 *
 * This module defines the pool-based grouping system for cameras.
 * Cameras are assigned to pools based on their evaluation scores and labels.
 */

import type { CameraEvaluation } from "./client-ranking";

export type PoolId = 1 | 2 | 3 | 4 | 5;

export type PoolDefinition = {
  id: PoolId;
  name: string;
  description: string;
  minScore: number;
  validDurationMinutes: number | null; // null = no fixed expiration
};

/**
 * Pool definitions matching the user's requirements:
 * - Pool 1: Golden hour core (sunset/sunrise ±30min, clear weather)
 * - Pool 2: Golden hour extended + Blue hour + Golden hour with clouds/snow
 * - Pool 3: Approaching golden hour (within 2 hours, clear daytime)
 * - Pool 4: Clear daytime + Clear night skyline + Ski resort (non-sleep hours)
 * - Pool 5: Low quality (not displayed)
 */
export const POOL_DEFINITIONS: Record<PoolId, PoolDefinition> = {
  1: {
    id: 1,
    name: "Golden Hour Core",
    description: "日出日落前后30分钟，晴天",
    minScore: 90,
    validDurationMinutes: 5, // Sync with backend cron (every 5 minutes)
  },
  2: {
    id: 2,
    name: "Golden Hour Extended & Blue Hour",
    description: "日出日落前后30-60分钟（晴天），或前后0-30分钟（有云/有雪），或蓝调时刻",
    minScore: 75,
    validDurationMinutes: 5, // Sync with backend cron (every 5 minutes)
  },
  3: {
    id: 3,
    name: "Approaching Golden Hour",
    description: "距离日出日落2小时内的晴天白天",
    minScore: 60,
    validDurationMinutes: 5, // Sync with backend cron (every 5 minutes)
  },
  4: {
    id: 4,
    name: "Daytime & Special Night",
    description: "晴天白天 + 晴天夜晚的skyline + 非睡眠时间的滑雪场",
    minScore: 40,
    validDurationMinutes: 5, // Sync with backend cron (every 5 minutes)
  },
  5: {
    id: 5,
    name: "Low Quality",
    description: "不展示",
    minScore: 0,
    validDurationMinutes: null,
  },
};

/**
 * Assign a camera to a pool based on its evaluation
 */
export function assignToPool(evaluation: CameraEvaluation, tags?: string[]): PoolId {
  const { score, label, weatherClass, isDaytime } = evaluation;

  // Check if camera is weather-resistant (skyline, street scenes, ski resorts, etc.)
  const isWeatherResistant = tags?.some(tag =>
    ['City Skyline', 'Street Scene', 'Railway', 'Ski Resort', 'Wildlife'].includes(tag)
  ) ?? false;

  // Check if it's a night scene (special handling)
  const isNightScene = label === "city-skyline-night" || label === "night";

  // Check if it's an aurora camera (only valuable at night)
  const isAuroraCamera = tags?.includes('Aurora') ?? false;

  // Special rule: Aurora cameras during daytime → Pool 5 (not worth showing)
  // Aurora is only visible at night
  if (isAuroraCamera && isDaytime) {
    return 5;
  }

  // Pool 5: Low quality, don't display
  // - Default threshold: 25
  // - Weather-resistant cameras: 20
  // - Night scenes: 15 (they're often valuable even with lower scores)
  // - Aurora cameras: 15 (valuable at night even with lower scores)
  let pool5Threshold = 25;
  if (isNightScene || isAuroraCamera) {
    pool5Threshold = 15;
  } else if (isWeatherResistant) {
    pool5Threshold = 20;
  }

  if (score < pool5Threshold) {
    return 5;
  }

  // Pool 1: Golden hour core + clear weather
  if (
    (label === "sunset-primary" || label === "sunrise-primary") &&
    weatherClass === "clear" &&
    score >= 90
  ) {
    return 1;
  }

  // Pool 2: Extended golden hour OR Blue hour OR Golden hour with clouds/snow OR high-score golden hour
  if (score >= 75) {
    // Blue hour
    if (label === "blue-hour-sunset" || label === "blue-hour-sunrise") {
      return 2;
    }

    // Extended golden hour with clear weather
    if (
      (label === "sunset-extended" ||
       label === "sunset-extended-after" ||
       label === "sunrise-extended") &&
      weatherClass === "clear"
    ) {
      return 2;
    }

    // Golden hour core (primary) - any weather
    // High score (75-89) golden hour goes to Pool 2
    // Perfect score (90+) golden hour goes to Pool 1
    if (label === "sunset-primary" || label === "sunrise-primary") {
      return 2;
    }
  }

  // Pool 3: Approaching golden hour OR good visibility during golden hour windows
  if (score >= 60 && score < 75) {
    // Clear approaching golden hour
    if (
      isDaytime &&
      weatherClass === "clear" &&
      (label === "approaching-sunset" ||
       label === "approaching-sunrise" ||
       label === "after-sunrise")
    ) {
      return 3;
    }

    // Golden hour with acceptable weather (not clear but good visibility)
    // e.g., partly cloudy or light weather during sunrise/sunset
    if (
      (label === "sunset-primary" ||
       label === "sunrise-primary" ||
       label === "sunset-extended" ||
       label === "sunrise-extended" ||
       label === "blue-hour-sunset" ||
       label === "blue-hour-sunrise") &&
      (weatherClass === "partly-cloudy" || weatherClass === "other")
    ) {
      return 3;
    }

    // Night skyline with good visibility
    if (label === "city-skyline-night" && tags?.includes('City Skyline')) {
      return 3;
    }
  }

  // Pool 4: Medium quality scenes
  // - Lower threshold from 40 to 35 to include more marginal cases
  // - Weather-resistant cameras get even lower threshold (18)
  // - Night scenes get special threshold (15)

  // Determine threshold based on camera type
  let pool4Threshold = 35; // Default
  if (isWeatherResistant) {
    pool4Threshold = 18;
  } else if (isNightScene) {
    pool4Threshold = 15;
  }

  if (score >= pool4Threshold && score < 75) {
    // Night scenes (always display if above threshold, regardless of weather)
    if (isNightScene && score >= 15) {
      return 4;
    }

    // Clear or partly cloudy daytime
    if (weatherClass === "clear" || weatherClass === "partly-cloudy") {
      return 4;
    }

    // Weather-resistant cameras even with worse weather
    if (isWeatherResistant) {
      return 4;
    }

    // Other weather classes with decent score
    if (score >= 40) {
      return 4;
    }
  }

  // Pool 5: Low score
  return 5;
}

/**
 * Determine the current best pool based on all camera evaluations
 * Returns the highest priority pool that has enough cameras
 */
export function determineCurrentPool(
  allEvaluations: Array<{ cameraId: string; evaluation: CameraEvaluation; poolId: PoolId }>
): PoolId {
  // Count cameras in each pool
  const poolCounts: Record<PoolId, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  for (const item of allEvaluations) {
    poolCounts[item.poolId]++;
  }

  // Prefer highest priority pool with sufficient cameras
  if (poolCounts[1] >= 3) return 1; // At least 3 golden hour cameras
  if (poolCounts[2] >= 5) return 2; // At least 5 extended/blue hour cameras
  if (poolCounts[3] >= 5) return 3; // At least 5 approaching cameras
  if (poolCounts[4] >= 5) return 4; // At least 5 daytime/night cameras

  // Fallback: select highest priority pool with any cameras
  if (poolCounts[1] > 0) return 1;
  if (poolCounts[2] > 0) return 2;
  if (poolCounts[3] > 0) return 3;
  if (poolCounts[4] > 0) return 4;

  // Ultimate fallback
  return 4;
}
