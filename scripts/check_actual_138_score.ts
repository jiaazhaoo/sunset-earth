/**
 * 检查数据库中138号摄像头的实际评分
 */

import { createClient } from '@supabase/supabase-js';
import { scoreCameraWeather } from '@/lib/client-ranking-v2';
import { parseCameraMetadata } from '@/lib/camera-metadata-types';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkActual138Score() {
  console.log('🔍 Checking ACTUAL Camera #138 Score from Database\n');
  console.log('='.repeat(60));

  // 1. 获取摄像头信息
  const { data: camera, error: cameraError } = await supabase
    .from('camera_ytb')
    .select('*')
    .eq('camera_id', 138)
    .single();

  if (cameraError || !camera) {
    console.error('❌ Error fetching camera:', cameraError);
    return;
  }

  console.log('📹 Camera Info:');
  console.log('  ID:', camera.camera_id);
  console.log('  Lat/Lon:', camera.latitude, camera.longitude);
  console.log('  Timezone:', camera.timezone);
  console.log('  Metadata:', JSON.stringify(camera.camera_metadata, null, 2));
  console.log('');

  // 2. 检查是否有存储的ranking数据
  const { data: rankings, error: rankError } = await supabase
    .from('camera_rankings')
    .select('*')
    .eq('camera_id', 138)
    .order('created_at', { ascending: false })
    .limit(5);

  if (rankings && rankings.length > 0) {
    console.log('📊 Recent Rankings (from database):');
    for (const rank of rankings) {
      console.log('  -', new Date(rank.created_at).toLocaleString(), '→ Score:', rank.score);
    }
    console.log('');
  } else {
    console.log('ℹ️  No rankings found in database');
    console.log('');
  }

  // 3. 获取当前天气并实时计算评分
  console.log('🌐 Fetching current weather...');
  const weatherResponse = await fetch(
    `https://api.open-meteo.com/v1/forecast?` +
    `latitude=${camera.latitude}&longitude=${camera.longitude}&` +
    `current_weather=true&` +
    `hourly=weathercode,cloudcover,relativehumidity_2m,visibility,precipitation,snowfall&` +
    `daily=sunrise,sunset&` +
    `timezone=${encodeURIComponent(camera.timezone)}&` +
    `forecast_days=1`
  );

  if (!weatherResponse.ok) {
    console.error('❌ Weather API error:', weatherResponse.status);
    return;
  }

  const weather = await weatherResponse.json();
  const now = new Date();

  console.log('');
  console.log('☁️ Current Weather:');
  console.log('  Time:', now.toLocaleString('en-US', { timeZone: camera.timezone }));
  console.log('  Weathercode:', weather.current_weather?.weathercode);
  console.log('  is_day:', weather.current_weather?.is_day);
  console.log('  Sunrise:', weather.daily?.sunrise?.[0]);
  console.log('  Sunset:', weather.daily?.sunset?.[0]);
  console.log('');

  // 4. 解析元数据并计算评分
  const metadata = parseCameraMetadata(camera.camera_metadata);

  console.log('📋 Parsed Metadata:');
  console.log('  Primary Type:', metadata?.primaryType);
  console.log('  dayOnly:', metadata?.viewingTime?.dayOnly);
  console.log('  nightOnly:', metadata?.viewingTime?.nightOnly);
  console.log('  anytime:', metadata?.viewingTime?.anytime);
  console.log('');

  console.log('🧮 Computing Score with Algorithm v2...');
  console.log('');

  const evaluation = scoreCameraWeather(weather, now, {
    cameraMetadata: metadata,
    timezone: camera.timezone,
  });

  console.log('='.repeat(60));
  console.log('\n📊 COMPUTED RESULT:\n');
  console.log('  Score:', evaluation.score);
  console.log('  Label:', evaluation.label);
  console.log('  isDaytime:', evaluation.isDaytime);
  console.log('  weatherClass:', evaluation.weatherClass);
  console.log('  isClear:', evaluation.isClear);
  console.log('  distanceMinutes:', evaluation.distanceMinutes);
  console.log('');

  console.log('='.repeat(60));
  console.log('\n❓ Expected vs Actual:\n');

  const localTime = new Date().toLocaleTimeString('en-US', {
    timeZone: camera.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  console.log(`  Current time (${camera.timezone}):`, localTime);
  console.log('  Expected score for dayOnly camera at night: 2-5');
  console.log('  Actual computed score:', evaluation.score);
  console.log('');

  if (evaluation.score > 50) {
    console.log('❌ PROBLEM DETECTED!');
    console.log('');
    console.log('Debug info:');
    console.log('  - isDaytime:', evaluation.isDaytime, '(expected: false or null)');
    console.log('  - label:', evaluation.label);
    console.log('  - If isDaytime=true, this is the bug!');
    console.log('  - If isDaytime=false/null but score>50, dayOnly penalty not applied!');
  } else {
    console.log('✅ Score is correct');
  }
  console.log('');
}

checkActual138Score().catch(console.error);
