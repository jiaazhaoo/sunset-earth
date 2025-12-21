/**
 * Check Camera #138 metadata and scoring
 */

import { createClient } from '@supabase/supabase-js';
import { scoreCameraWeather } from '@/lib/client-ranking-v2';
import { parseCameraMetadata } from '@/lib/camera-metadata-types';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkCamera138() {
  console.log('🔍 Checking Camera #138\n');

  // 1. Get camera data
  const { data: camera, error } = await supabase
    .from('camera_ytb')
    .select('*')
    .eq('camera_id', 138)
    .single();

  if (error || !camera) {
    console.error('❌ Failed to fetch camera:', error);
    return;
  }

  console.log('📹 Camera Info:');
  console.log('  ID:', camera.camera_id);
  console.log('  Name:', camera.camera_name);
  console.log('  Timezone:', camera.timezone);
  console.log('  Latitude:', camera.latitude);
  console.log('  Longitude:', camera.longitude);
  console.log('');

  // 2. Parse metadata
  const metadata = parseCameraMetadata(camera.camera_metadata);
  console.log('📊 Metadata:');
  console.log('  Primary Type:', metadata?.primaryType);
  console.log('  Is Farpoint:', metadata?.isFarpoint);
  console.log('  Tier:', metadata?.tier);
  console.log('  Resolution:', metadata?.resolution);
  console.log('  Viewing Time:', JSON.stringify(metadata?.viewingTime, null, 2));
  console.log('  Weather Tolerance:', JSON.stringify(metadata?.weatherTolerance, null, 2));
  console.log('');

  // 3. Test scoring at different times
  const testTimes = [
    { label: '白天 (12:00 local)', hour: 12 },
    { label: '黄昏 (18:00 local)', hour: 18 },
    { label: '晚上 (20:00 local)', hour: 20 },
    { label: '深夜 (23:00 local)', hour: 23 },
    { label: '凌晨 (02:00 local)', hour: 2 },
  ];

  // Mock clear weather
  const clearWeather = {
    latitude: camera.latitude,
    longitude: camera.longitude,
    timezone: camera.timezone,
    utc_offset_seconds: 0,
    current_weather: {
      time: new Date().toISOString(),
      weathercode: 0,
      is_day: 1,
    },
    hourly: {
      time: [new Date().toISOString()],
      weathercode: [0],
      cloudcover: [10],
      relativehumidity_2m: [60],
      visibility: [20000],
      precipitation: [0],
      snowfall: [0],
    },
    daily: {
      time: [new Date().toISOString().split('T')[0]],
      sunrise: [new Date(Date.now() - 6 * 3600000).toISOString()],
      sunset: [new Date(Date.now() + 2 * 3600000).toISOString()],
    },
  };

  console.log('🧪 Scoring at Different Times:\n');

  for (const { label, hour } of testTimes) {
    const testTime = new Date();
    testTime.setHours(hour, 0, 0, 0);

    const evaluation = scoreCameraWeather(clearWeather, testTime, {
      cameraMetadata: metadata,
      timezone: camera.timezone,
    });

    console.log(`${label}:`);
    console.log(`  Score: ${evaluation.score.toFixed(2)}`);
    console.log(`  Label: ${evaluation.label || 'N/A'}`);
    console.log(`  Is Daytime: ${evaluation.isDaytime}`);
    console.log(`  Weather Class: ${evaluation.weatherClass}`);
    console.log(`  Distance Minutes: ${evaluation.distanceMinutes?.toFixed(1) || 'N/A'}`);
    console.log('');
  }

  // 4. Check if it's a night-only camera
  if (metadata?.viewingTime?.nightOnly) {
    console.log('⚠️ This is a NIGHT-ONLY camera (e.g., aurora, city-skyline-night)');
    console.log('   It should score 0 during daytime and high at night.');
  }

  if (metadata?.viewingTime?.anytime) {
    console.log('✅ This is an ANYTIME camera');
    console.log('   It can score well at any time of day.');
  }

  if (metadata?.primaryType === 'city-skyline' && !metadata?.viewingTime?.nightOnly) {
    console.log('🌃 This is a CITY SKYLINE camera (not night-only)');
    console.log('   It scores well during both day and night.');
  }
}

checkCamera138().catch(console.error);
