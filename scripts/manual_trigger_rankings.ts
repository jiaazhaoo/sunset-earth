/**
 * 手动触发排名计算并显示结果
 */

import { createClient } from '@supabase/supabase-js';
import { scoreCameraWeather } from '@/lib/client-ranking-v2';
import { parseCameraMetadata } from '@/lib/camera-metadata-types';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function manualTriggerRankings() {
  console.log('🚀 Manually Triggering Rankings Calculation\n');
  console.log('='.repeat(60));

  // 1. 获取所有摄像头
  const { data: cameras, error: camerasError } = await supabase
    .from('camera_ytb')
    .select('*')
    .order('camera_id');

  if (camerasError || !cameras) {
    console.error('❌ Error fetching cameras:', camerasError);
    return;
  }

  console.log(`📹 Found ${cameras.length} cameras`);
  console.log('');

  // 2. 对前10个摄像头计算评分（示例）
  const now = new Date();
  console.log(`🕐 Current time: ${now.toISOString()}`);
  console.log('');

  const results = [];

  for (const camera of cameras.slice(0, 10)) {
    try {
      // 获取天气数据
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?` +
        `latitude=${camera.latitude}&longitude=${camera.longitude}&` +
        `current_weather=true&` +
        `hourly=weathercode,cloudcover,relativehumidity_2m,visibility,precipitation,snowfall&` +
        `daily=sunrise,sunset&` +
        `timezone=${encodeURIComponent(camera.timezone)}&` +
        `forecast_days=1`;

      const weatherResponse = await fetch(weatherUrl);
      const weather = await weatherResponse.json();

      // 解析元数据
      const metadata = parseCameraMetadata(camera.camera_metadata);

      // 计算评分
      const evaluation = scoreCameraWeather(weather, now, {
        cameraMetadata: metadata,
        timezone: camera.timezone,
      });

      results.push({
        camera_id: camera.camera_id,
        camera_name: camera.title || `Camera ${camera.camera_id}`,
        score: evaluation.score,
        label: evaluation.label,
        isDaytime: evaluation.isDaytime,
        primaryType: metadata?.primaryType,
        tier: metadata?.tier,
        timezone: camera.timezone,
      });

      console.log(`✓ Camera #${camera.camera_id}: ${evaluation.score} (${evaluation.label})`);
    } catch (error) {
      console.error(`✗ Camera #${camera.camera_id}: Error -`, error);
    }
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('\n📊 Top 10 Rankings:\n');

  // 排序并显示
  const sorted = results
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score);

  sorted.slice(0, 10).forEach((result, index) => {
    let localTime = 'N/A';
    try {
      localTime = new Date().toLocaleTimeString('en-US', {
        timeZone: result.timezone || 'UTC',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    } catch (e) {
      // Ignore timezone errors
    }

    console.log(`${index + 1}. Camera #${result.camera_id} (${result.primaryType}/${result.tier})`);
    console.log(`   Score: ${result.score}`);
    console.log(`   Label: ${result.label}`);
    console.log(`   Local time: ${localTime} (${result.timezone || 'unknown'})`);
    console.log(`   isDaytime: ${result.isDaytime}`);
    console.log('');
  });

  // 特别关注138号
  console.log('='.repeat(60));
  console.log('\n🎿 Camera #138 (Ski Resort) Status:\n');

  const camera138Result = results.find(r => r.camera_id === 138);
  if (camera138Result) {
    console.log('  Score:', camera138Result.score);
    console.log('  Label:', camera138Result.label);
    console.log('  isDaytime:', camera138Result.isDaytime);
    console.log('  Status:', camera138Result.score < 10 ? '✅ Correctly low (night)' : '❌ Incorrectly high');
  } else {
    console.log('  (Not in top 10, fetching separately...)');

    const { data: camera138 } = await supabase
      .from('camera_ytb')
      .select('*')
      .eq('camera_id', 138)
      .single();

    if (camera138) {
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?` +
        `latitude=${camera138.latitude}&longitude=${camera138.longitude}&` +
        `current_weather=true&` +
        `hourly=weathercode,cloudcover,relativehumidity_2m,visibility,precipitation,snowfall&` +
        `daily=sunrise,sunset&` +
        `timezone=${encodeURIComponent(camera138.timezone)}&` +
        `forecast_days=1`;

      const weatherResponse = await fetch(weatherUrl);
      const weather = await weatherResponse.json();
      const metadata = parseCameraMetadata(camera138.camera_metadata);

      const evaluation = scoreCameraWeather(weather, now, {
        cameraMetadata: metadata,
        timezone: camera138.timezone,
      });

      console.log('  Score:', evaluation.score);
      console.log('  Label:', evaluation.label);
      console.log('  isDaytime:', evaluation.isDaytime);
      console.log('  Status:', evaluation.score < 10 ? '✅ Correctly low (night)' : '❌ Incorrectly high');
    }
  }

  console.log('');
}

manualTriggerRankings().catch(console.error);
