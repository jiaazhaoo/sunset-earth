/**
 * Quick Verification Script for Algorithm v2
 *
 * 快速验证新算法是否生效的脚本
 *
 * Usage:
 *   npx tsx scripts/quick_verify_v2.ts
 */

import { createClient } from '@supabase/supabase-js';
import { scoreCameraWeather, type OpenMeteoResponse } from '@/lib/client-ranking-v2';
import { parseCameraMetadata } from '@/lib/camera-metadata-types';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function quickVerify() {
  console.log('🔍 Quick Verification of Algorithm v2\n');

  // Step 1: Check database
  console.log('1️⃣ Checking database migration...');
  const { count, error } = await supabase
    .from('camera_ytb')
    .select('camera_id', { count: 'exact', head: true })
    .not('camera_metadata', 'is', null);

  if (error) {
    console.log('❌ Database error:', error.message);
    return false;
  }

  if (count === 156) {
    console.log(`✅ Database OK: ${count}/156 cameras have metadata\n`);
  } else {
    console.log(`❌ Database incomplete: ${count}/156 cameras have metadata\n`);
    return false;
  }

  // Step 2: Test key cameras
  console.log('2️⃣ Testing key cameras...');

  const testCameras = [1, 7, 11]; // Aurora, Street, City Skyline

  const { data: cameras } = await supabase
    .from('camera_ytb')
    .select('camera_id, camera_name, camera_metadata, timezone')
    .in('camera_id', testCameras);

  if (!cameras || cameras.length === 0) {
    console.log('❌ Failed to fetch test cameras');
    return false;
  }

  const now = new Date();
  const sunrise = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const sunset = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  const mockWeather: OpenMeteoResponse = {
    latitude: 40.7,
    longitude: -74,
    timezone: 'America/New_York',
    utc_offset_seconds: -5 * 3600,
    current_weather: { time: now.toISOString(), weathercode: 0, is_day: 1 },
    hourly: {
      time: [now.toISOString()],
      weathercode: [0],
      cloudcover: [10],
      relativehumidity_2m: [50],
      visibility: [20000],
      precipitation: [0],
      snowfall: [0],
    },
    daily: {
      time: [now.toISOString()],
      sunrise: [sunrise.toISOString()],
      sunset: [sunset.toISOString()],
    },
  };

  for (const camera of cameras) {
    const metadata = parseCameraMetadata(camera.camera_metadata);
    if (!metadata) {
      console.log(`❌ Camera #${camera.camera_id}: Failed to parse metadata`);
      continue;
    }

    const evaluation = scoreCameraWeather(mockWeather, new Date(), {
      cameraMetadata: metadata,
      timezone: camera.timezone,
    });

    console.log(
      `✅ Camera #${camera.camera_id} (${metadata.primaryType}): Score=${evaluation.score.toFixed(
        2
      )}, Weather=${evaluation.weatherClass}`
    );
  }

  console.log('\n3️⃣ Testing critical fixes...');

  // Test Aurora during daytime (should be 0)
  const aurora = cameras.find((c) => c.camera_id === 1);
  if (aurora) {
    const metadata = parseCameraMetadata(aurora.camera_metadata);
    const daytimeEval = scoreCameraWeather(mockWeather, new Date(), {
      cameraMetadata: metadata!,
    });

    if (daytimeEval.score === 0) {
      console.log('✅ Aurora daytime penalty: Score is 0 during daytime');
    } else {
      console.log(`❌ Aurora daytime penalty: Score is ${daytimeEval.score} (expected 0)`);
      return false;
    }
  }

  console.log('\n✅ All checks passed! Algorithm v2 is working correctly.');
  return true;
}

quickVerify()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((err) => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
