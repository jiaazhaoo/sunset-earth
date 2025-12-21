/**
 * Test Script for Algorithm v2
 *
 * This script validates that:
 * 1. Database migration was successful
 * 2. Algorithm v2 is working correctly
 * 3. Key fixes are applied (daytime definition, farpoint weighting, etc.)
 * 4. Results match expected behavior
 *
 * Usage:
 *   npx tsx scripts/test_algorithm_v2.ts
 */

import { createClient } from '@supabase/supabase-js';
import { scoreCameraWeather, rankCameras, type OpenMeteoResponse } from '@/lib/client-ranking-v2';
import { parseCameraMetadata, type CameraMetadata } from '@/lib/camera-metadata-types';

// ============================================================
// Configuration
// ============================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing environment variables: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// Test Data - Mock Weather
// ============================================================

const BASE_NOW = new Date();
const BASE_SUNRISE = new Date(BASE_NOW.getTime() - 2 * 60 * 60 * 1000); // 2 hours ago
const BASE_SUNSET = new Date(BASE_NOW.getTime() + 2 * 60 * 60 * 1000);  // 2 hours from now

const CLEAR_WEATHER: OpenMeteoResponse = {
  latitude: 40.7128,
  longitude: -74.006,
  timezone: 'America/New_York',
  utc_offset_seconds: -5 * 3600,
  current_weather: {
    time: BASE_NOW.toISOString(),
    weathercode: 0, // Clear sky
    is_day: 1,
  },
  hourly: {
    time: [BASE_NOW.toISOString()],
    weathercode: [0],
    cloudcover: [10],
    relativehumidity_2m: [50],
    visibility: [20000],
    precipitation: [0],
    snowfall: [0],
  },
  daily: {
    time: [BASE_NOW.toISOString()],
    sunrise: [BASE_SUNRISE.toISOString()],
    sunset: [BASE_SUNSET.toISOString()],
  },
};

const BASE_HOURLY = CLEAR_WEATHER.hourly!;
const BASE_DAILY = CLEAR_WEATHER.daily!;

const CLOUDY_WEATHER: OpenMeteoResponse = {
  ...CLEAR_WEATHER,
  current_weather: {
    ...CLEAR_WEATHER.current_weather!,
    weathercode: 3, // Overcast
    is_day: 1,
  },
  hourly: {
    ...BASE_HOURLY,
    weathercode: [3],
    cloudcover: [85],
  },
};

const RAINY_WEATHER: OpenMeteoResponse = {
  ...CLEAR_WEATHER,
  current_weather: {
    ...CLEAR_WEATHER.current_weather!,
    weathercode: 61, // Rain
    is_day: 1,
  },
  hourly: {
    ...BASE_HOURLY,
    weathercode: [61],
    cloudcover: [90],
    precipitation: [3.5], // Moderate rain
  },
};

const LOW_VISIBILITY_WEATHER: OpenMeteoResponse = {
  ...CLEAR_WEATHER,
  hourly: {
    ...BASE_HOURLY,
    visibility: [3000], // 3km - low visibility
  },
};

// ============================================================
// Test Functions
// ============================================================

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  details?: any;
}

const results: TestResult[] = [];

function addResult(name: string, passed: boolean, message: string, details?: any) {
  results.push({ name, passed, message, details });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${name}: ${message}`);
  if (details) {
    console.log('   Details:', JSON.stringify(details, null, 2));
  }
}

// Test 1: Database Migration Verification
async function testDatabaseMigration() {
  console.log('\n📊 Test 1: Database Migration');
  console.log('='.repeat(60));

  try {
    // Check if camera_metadata field exists and has data
    const { data, error, count } = await supabase
      .from('camera_ytb')
      .select('camera_id, camera_metadata', { count: 'exact' })
      .not('camera_metadata', 'is', null);

    if (error) {
      addResult('Database Migration', false, `Database error: ${error.message}`);
      return;
    }

    const expectedCount = 156;
    const actualCount = count || 0;

    if (actualCount === expectedCount) {
      addResult('Database Migration', true, `All ${expectedCount} cameras have metadata`);
    } else {
      addResult('Database Migration', false, `Expected ${expectedCount} cameras, got ${actualCount}`, { actualCount });
    }

    // Verify metadata structure for a few cameras
    if (data && data.length > 0) {
      const sampleCameras = [1, 7, 11, 2]; // Aurora, Street, City Skyline, Farpoint Mountain
      const samples = data.filter((c: any) => sampleCameras.includes(c.camera_id));

      samples.forEach((camera: any) => {
        const metadata = parseCameraMetadata(camera.camera_metadata);
        if (metadata) {
          addResult(
            `Metadata Structure (Camera #${camera.camera_id})`,
            true,
            `Valid metadata: ${metadata.primaryType}, farpoint=${metadata.isFarpoint}`,
            metadata
          );
        } else {
          addResult(
            `Metadata Structure (Camera #${camera.camera_id})`,
            false,
            'Failed to parse metadata'
          );
        }
      });
    }
  } catch (err: any) {
    addResult('Database Migration', false, `Exception: ${err.message}`);
  }
}

// Test 2: Algorithm Core Functionality
function testAlgorithmCore() {
  console.log('\n🧮 Test 2: Algorithm Core Functionality');
  console.log('='.repeat(60));

  const now = new Date();

  // Test 2.1: Basic scoring
  const basicEval = scoreCameraWeather(CLEAR_WEATHER, now, {
    cameraMetadata: null,
  });

  if (basicEval.score >= 0 && basicEval.score <= 100) {
    addResult('Basic Scoring', true, `Score in valid range: ${basicEval.score.toFixed(2)}`);
  } else {
    addResult('Basic Scoring', false, `Score out of range: ${basicEval.score}`, basicEval);
  }

  // Test 2.2: Metadata-driven scoring
  const citySkylineMetadata: CameraMetadata = {
    primaryType: 'city-skyline',
    isFarpoint: true,
    tier: 't0',
    resolution: '4k',
    viewingTime: {
      dayOnly: false,
      nightOnly: false,
      noSleepTime: false,
      anytime: true,
    },
    weatherTolerance: {
      clear: true,
      partlyCloudy: true,
      lightRain: false,
      lightSnow: false,
    },
  };

  const metadataEval = scoreCameraWeather(CLEAR_WEATHER, now, {
    cameraMetadata: citySkylineMetadata,
    timezone: 'America/New_York',
  });

  if (metadataEval.score > 0) {
    addResult('Metadata-Driven Scoring', true, `City skyline scored ${metadataEval.score.toFixed(2)}`);
  } else {
    addResult('Metadata-Driven Scoring', false, 'Score is 0', metadataEval);
  }
}

// Test 3: Critical Fixes Validation
function testCriticalFixes() {
  console.log('\n🔧 Test 3: Critical Fixes Validation');
  console.log('='.repeat(60));

  const now = new Date();

  // Test 3.1: Extended Daytime Definition (sunrise-45min to sunset+45min)
  const sunriseTime = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
  const sunsetTime = new Date(Date.now() + 2 * 60 * 60 * 1000);  // 2 hours from now
  const beforeSunrise30min = new Date(sunriseTime.getTime() - 30 * 60 * 1000);
  const afterSunset30min = new Date(sunsetTime.getTime() + 30 * 60 * 1000);

  const weatherWithSolar: OpenMeteoResponse = {
    ...CLEAR_WEATHER,
    daily: {
      time: BASE_DAILY.time,
      sunrise: [sunriseTime.toISOString()],
      sunset: [sunsetTime.toISOString()],
    },
  };

  const evalBeforeSunrise = scoreCameraWeather(weatherWithSolar, beforeSunrise30min, {});
  const evalAfterSunset = scoreCameraWeather(weatherWithSolar, afterSunset30min, {});

  // Within extended daytime window (sunrise-45 to sunset+45), isDaytime should be true
  if (evalBeforeSunrise.isDaytime === true && evalAfterSunset.isDaytime === true) {
    addResult(
      'Extended Daytime Definition',
      true,
      'Daytime extends 45min before sunrise and after sunset',
      { beforeSunrise: evalBeforeSunrise.isDaytime, afterSunset: evalAfterSunset.isDaytime }
    );
  } else {
    addResult(
      'Extended Daytime Definition',
      false,
      'Extended daytime not working correctly',
      { beforeSunrise: evalBeforeSunrise.isDaytime, afterSunset: evalAfterSunset.isDaytime }
    );
  }

  // Test 3.2: Farpoint Visibility Weighting (70%)
  const farpointMetadata: CameraMetadata = {
    primaryType: 'mountain',
    isFarpoint: true,
    tier: 't0',
    resolution: '4k',
    viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: false },
  };

  const evalHighVis = scoreCameraWeather(
    { ...CLEAR_WEATHER, hourly: { ...BASE_HOURLY, visibility: [20000] } },
    now,
    { cameraMetadata: farpointMetadata }
  );

  const evalLowVis = scoreCameraWeather(
    { ...LOW_VISIBILITY_WEATHER },
    now,
    { cameraMetadata: farpointMetadata }
  );

  const visibilityDiff = evalHighVis.score - evalLowVis.score;

  if (visibilityDiff > 10) {
    addResult(
      'Farpoint Visibility Weighting',
      true,
      `High visibility scored ${visibilityDiff.toFixed(2)} points higher`,
      { highVis: evalHighVis.score, lowVis: evalLowVis.score }
    );
  } else {
    addResult(
      'Farpoint Visibility Weighting',
      false,
      `Visibility difference too small: ${visibilityDiff.toFixed(2)}`,
      { highVis: evalHighVis.score, lowVis: evalLowVis.score }
    );
  }

  // Test 3.3: Aurora Daytime = 0 Score
  const auroraMetadata: CameraMetadata = {
    primaryType: 'aurora',
    isFarpoint: false,
    tier: 't2',
    resolution: '1080p',
    viewingTime: { dayOnly: false, nightOnly: true, noSleepTime: false, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false },
  };

  const daytimeWeather: OpenMeteoResponse = {
    ...CLEAR_WEATHER,
    current_weather: { ...CLEAR_WEATHER.current_weather!, is_day: 1 },
  };

  const evalAuroraDaytime = scoreCameraWeather(daytimeWeather, now, {
    cameraMetadata: auroraMetadata,
  });

  if (evalAuroraDaytime.score === 0) {
    addResult('Aurora Daytime Penalty', true, 'Aurora correctly scored 0 during daytime');
  } else {
    addResult(
      'Aurora Daytime Penalty',
      false,
      `Aurora scored ${evalAuroraDaytime.score} during daytime (expected 0)`,
      evalAuroraDaytime
    );
  }

  // Test 3.4: Sleep Time Penalty (0.05 multiplier)
  const streetMetadata: CameraMetadata = {
    primaryType: 'street',
    isFarpoint: false,
    tier: 't2',
    resolution: '4k',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: true, anytime: false },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: true, lightSnow: false },
  };

  // Create sleep time (23:00 local time)
  const sleepTimeDate = new Date();
  sleepTimeDate.setHours(23, 0, 0, 0);

  const evalSleepTime = scoreCameraWeather(CLEAR_WEATHER, sleepTimeDate, {
    cameraMetadata: streetMetadata,
    timezone: 'America/New_York',
  });

  if (evalSleepTime.score < 10) {
    addResult(
      'Sleep Time Penalty',
      true,
      `Street camera scored ${evalSleepTime.score.toFixed(2)} during sleep time (<10)`,
      evalSleepTime
    );
  } else {
    addResult(
      'Sleep Time Penalty',
      false,
      `Sleep time penalty insufficient: ${evalSleepTime.score.toFixed(2)}`,
      evalSleepTime
    );
  }
}

// Test 4: Weather Classification
function testWeatherClassification() {
  console.log('\n🌦️  Test 4: Weather Classification');
  console.log('='.repeat(60));

  const now = new Date();

  const clearEval = scoreCameraWeather(CLEAR_WEATHER, now, {});
  const cloudyEval = scoreCameraWeather(CLOUDY_WEATHER, now, {});
  const rainyEval = scoreCameraWeather(RAINY_WEATHER, now, {});

  addResult(
    'Clear Weather Classification',
    clearEval.weatherClass === 'clear',
    `Classified as: ${clearEval.weatherClass}`,
    { expected: 'clear', actual: clearEval.weatherClass }
  );

  addResult(
    'Cloudy Weather Classification',
    cloudyEval.weatherClass === 'cloudy',
    `Classified as: ${cloudyEval.weatherClass}`,
    { expected: 'cloudy', actual: cloudyEval.weatherClass }
  );

  // Rainy weather should be classified as moderate-rain (3.5mm)
  const isRainClassification = rainyEval.weatherClass?.includes('rain');
  addResult(
    'Rainy Weather Classification',
    isRainClassification || false,
    `Classified as: ${rainyEval.weatherClass}`,
    { expected: 'moderate-rain or rain', actual: rainyEval.weatherClass }
  );

  // Weather should affect scores
  if (clearEval.score > cloudyEval.score && cloudyEval.score > rainyEval.score) {
    addResult(
      'Weather Impact on Score',
      true,
      `Clear (${clearEval.score.toFixed(2)}) > Cloudy (${cloudyEval.score.toFixed(2)}) > Rainy (${rainyEval.score.toFixed(2)})`
    );
  } else {
    addResult(
      'Weather Impact on Score',
      false,
      'Weather not properly affecting scores',
      { clear: clearEval.score, cloudy: cloudyEval.score, rainy: rainyEval.score }
    );
  }
}

// Test 5: Tier-based Tiebreaker
function testTierTiebreaker() {
  console.log('\n🎨 Test 5: Tier-based Tiebreaker');
  console.log('='.repeat(60));

  const now = new Date();

  // Create metadata for different tiers
  const t0Metadata: CameraMetadata = {
    primaryType: 'city-skyline',
    isFarpoint: true,
    tier: 't0',
    resolution: '4k',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: false, anytime: true },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: false },
  };

  const t2Metadata: CameraMetadata = {
    primaryType: 'city-skyline',
    isFarpoint: true,
    tier: 't2',
    resolution: '4k',
    viewingTime: { dayOnly: false, nightOnly: false, noSleepTime: false, anytime: true },
    weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: false },
  };

  // Test 5.1: Score difference >1 - tier should NOT matter
  const highScoreT2 = scoreCameraWeather(CLEAR_WEATHER, now, { cameraMetadata: t2Metadata });
  const lowScoreT0 = scoreCameraWeather(CLOUDY_WEATHER, now, { cameraMetadata: t0Metadata });

  const camerasLargeGap = [
    { camera: { camera_id: 1 }, evaluation: { ...highScoreT2, score: 75 }, metadata: t2Metadata },
    { camera: { camera_id: 2 }, evaluation: { ...lowScoreT0, score: 70 }, metadata: t0Metadata },
  ];

  const rankedLargeGap = rankCameras(camerasLargeGap);

  if (rankedLargeGap[0].camera.camera_id === 1) {
    addResult(
      'Tier Does Not Override Large Score Gap',
      true,
      't2 camera with 75 score ranks above t0 camera with 70 score'
    );
  } else {
    addResult(
      'Tier Does Not Override Large Score Gap',
      false,
      'Tier incorrectly overrode 5-point score difference',
      { ranked: rankedLargeGap.map((c) => c.camera.camera_id) }
    );
  }

  // Test 5.2: Score difference ≤1 - tier SHOULD matter
  const camerasSmallGap = [
    { camera: { camera_id: 3 }, evaluation: { ...highScoreT2, score: 71 }, metadata: t2Metadata },
    { camera: { camera_id: 4 }, evaluation: { ...lowScoreT0, score: 71 }, metadata: t0Metadata },
  ];

  const rankedSmallGap = rankCameras(camerasSmallGap);

  if (rankedSmallGap[0].camera.camera_id === 4) {
    addResult(
      'Tier Breaks Tie for Close Scores',
      true,
      't0 camera ranks above t2 camera when both score 71',
      { t0_id: 4, t2_id: 3 }
    );
  } else {
    addResult(
      'Tier Breaks Tie for Close Scores',
      false,
      'Tier did not break tie correctly',
      { ranked: rankedSmallGap.map((c) => c.camera.camera_id) }
    );
  }

  // Test 5.3: Multiple tiers with close scores
  const t1Metadata: CameraMetadata = {
    ...t2Metadata,
    tier: 't1',
  };

  const camerasMultiTier = [
    { camera: { camera_id: 5 }, evaluation: { ...highScoreT2, score: 70 }, metadata: t2Metadata },
    { camera: { camera_id: 6 }, evaluation: { ...highScoreT2, score: 70 }, metadata: t0Metadata },
    { camera: { camera_id: 7 }, evaluation: { ...highScoreT2, score: 70 }, metadata: t1Metadata },
  ];

  const tierLookup = new Map(camerasMultiTier.map((c) => [c.camera.camera_id, c.metadata.tier]));
  const rankedMultiTier = rankCameras(camerasMultiTier);
  const rankedOrder = rankedMultiTier.map(
    (c) => `${tierLookup.get(c.camera.camera_id)}(#${c.camera.camera_id})`
  );

  const correctOrder =
    rankedMultiTier[0].camera.camera_id === 6 && // t0 first
    rankedMultiTier[1].camera.camera_id === 7 && // t1 second
    rankedMultiTier[2].camera.camera_id === 5; // t2 third

  if (correctOrder) {
    addResult(
      'Tier Order (t0 > t1 > t2)',
      true,
      'Cameras ranked correctly: t0(#6) > t1(#7) > t2(#5)',
      { order: rankedOrder }
    );
  } else {
    addResult(
      'Tier Order (t0 > t1 > t2)',
      false,
      'Tier ordering incorrect',
      { order: rankedOrder }
    );
  }
}

// ============================================================
// Main Test Runner
// ============================================================

async function runAllTests() {
  console.log('\n🚀 Algorithm v2 Validation Test Suite');
  console.log('='.repeat(60));
  console.log('This will verify:');
  console.log('  1. Database migration success');
  console.log('  2. Algorithm core functionality');
  console.log('  3. Critical fixes implementation');
  console.log('  4. Weather classification');
  console.log('  5. Tier-based tiebreaker');
  console.log('');

  await testDatabaseMigration();
  testAlgorithmCore();
  testCriticalFixes();
  testWeatherClassification();
  testTierTiebreaker();

  // Summary
  console.log('\n📋 Test Summary');
  console.log('='.repeat(60));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;

  console.log(`Total Tests: ${total}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);

  if (failed > 0) {
    console.log('\n❌ Failed Tests:');
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`  - ${r.name}: ${r.message}`);
      });
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed! Algorithm v2 is working correctly.');
    process.exit(0);
  }
}

// Run tests
runAllTests().catch((err) => {
  console.error('❌ Test suite failed with error:', err);
  process.exit(1);
});
