/**
 * 检查城市天际线摄像头的配置和评分
 */

import { createClient } from '@supabase/supabase-js';
import { scoreCameraWeather } from '@/lib/client-ranking-v2';
import { parseCameraMetadata } from '@/lib/camera-metadata-types';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkSkylineCameras() {
  console.log('🌃 Checking City Skyline Cameras\n');
  console.log('='.repeat(60));

  // 查询所有城市天际线摄像头
  const { data: cameras, error } = await supabase
    .from('camera_ytb')
    .select('*')
    .contains('camera_metadata', { primaryType: 'city-skyline' })
    .order('camera_id');

  if (error || !cameras) {
    console.error('❌ Error:', error);
    return;
  }

  console.log(`Found ${cameras.length} city-skyline cameras\n`);

  // 特别检查100和62号
  const targetCameras = [100, 62];

  for (const cameraId of targetCameras) {
    const camera = cameras.find(c => c.camera_id === cameraId);

    if (!camera) {
      console.log(`Camera #${cameraId}: Not found or not city-skyline`);
      console.log('');
      continue;
    }

    const metadata = parseCameraMetadata(camera.camera_metadata);

    console.log(`📹 Camera #${cameraId}:`);
    console.log('  Metadata:', JSON.stringify(metadata, null, 2));
    console.log('');

    // 获取当前天气
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?` +
      `latitude=${camera.latitude}&longitude=${camera.longitude}&` +
      `current_weather=true&` +
      `hourly=weathercode,cloudcover,relativehumidity_2m,visibility,precipitation,snowfall&` +
      `daily=sunrise,sunset&` +
      `timezone=${encodeURIComponent(camera.timezone)}&` +
      `forecast_days=1`;

    const weatherResponse = await fetch(weatherUrl);
    const weather = await weatherResponse.json();
    const now = new Date();

    // 计算当前评分
    const evaluation = scoreCameraWeather(weather, now, {
      cameraMetadata: metadata,
      timezone: camera.timezone,
    });

    console.log('  Current Scoring:');
    console.log('    Score:', evaluation.score);
    console.log('    Label:', evaluation.label);
    console.log('    isDaytime:', evaluation.isDaytime);
    console.log('    isClear:', evaluation.isClear);
    console.log('    weatherClass:', evaluation.weatherClass);
    console.log('');

    // 模拟晴朗夜晚
    const nightWeather = {
      ...weather,
      current_weather: {
        ...weather.current_weather,
        weathercode: 0, // clear
        is_day: 0, // night
      },
      hourly: {
        ...weather.hourly,
        weathercode: [0],
        cloudcover: [10],
        visibility: [20000],
        precipitation: [0],
        snowfall: [0],
      },
    };

    const nightEval = scoreCameraWeather(nightWeather, now, {
      cameraMetadata: metadata,
      timezone: camera.timezone,
    });

    console.log('  Simulated Clear Night:');
    console.log('    Score:', nightEval.score);
    console.log('    Label:', nightEval.label);
    console.log('    Expected: Should be high (70-90+) for t0/t1 skyline');
    console.log('    Status:', nightEval.score >= 70 ? '✅ Good' : '❌ Too low');
    console.log('');

    // 分析问题
    if (nightEval.score < 70 && nightEval.label !== 'clear-night-skyline') {
      console.log('  ⚠️ Problem detected:');
      console.log('    Label is not "clear-night-skyline"');
      console.log('    Possible reasons:');
      console.log('      1. viewingTime.anytime is not true');
      console.log('         Current: anytime =', metadata?.viewingTime?.anytime);
      console.log('      2. Weather is not clear');
      console.log('         Current: isClear =', nightEval.isClear);
      console.log('      3. It\'s being classified as daytime');
      console.log('         Current: isDaytime =', nightEval.isDaytime);
      console.log('');
    }

    console.log('='.repeat(60));
    console.log('');
  }

  // 列出所有city-skyline摄像头
  console.log('\n📊 All City Skyline Cameras Summary:\n');

  for (const camera of cameras) {
    const metadata = parseCameraMetadata(camera.camera_metadata);
    console.log(`#${camera.camera_id} (tier: ${metadata?.tier || 'unknown'})`);
    console.log(`  anytime: ${metadata?.viewingTime?.anytime}`);
    console.log(`  dayOnly: ${metadata?.viewingTime?.dayOnly}`);
    console.log(`  nightOnly: ${metadata?.viewingTime?.nightOnly}`);
    console.log('');
  }
}

checkSkylineCameras().catch(console.error);
