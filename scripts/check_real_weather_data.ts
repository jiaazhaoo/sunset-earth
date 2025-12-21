/**
 * 检查真实天气数据，看看为什么实际分数比理论计算低
 */

import { createClient } from '@supabase/supabase-js';
import { scoreCameraWeather } from '@/lib/client-ranking-v2';
import { parseCameraMetadata } from '@/lib/camera-metadata-types';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkRealWeatherData() {
  console.log('🌐 Checking Real Weather Data for City Skyline Cameras\n');
  console.log('='.repeat(60));

  // 查询62号和100号摄像头
  const targetCameras = [62, 100];

  for (const cameraId of targetCameras) {
    const { data: camera, error } = await supabase
      .from('camera_ytb')
      .select('*')
      .eq('camera_id', cameraId)
      .single();

    if (error || !camera) {
      console.error(`❌ Camera #${cameraId}: Error fetching camera`, error);
      continue;
    }

    console.log(`\n📹 Camera #${cameraId}`);
    console.log('-'.repeat(60));

    const metadata = parseCameraMetadata(camera.camera_metadata);
    console.log('Metadata:');
    console.log('  primaryType:', metadata?.primaryType);
    console.log('  tier:', metadata?.tier);
    console.log('  isFarpoint:', metadata?.isFarpoint);
    console.log('  anytime:', metadata?.viewingTime?.anytime);
    console.log('  noSleepTime:', metadata?.viewingTime?.noSleepTime);
    console.log('');

    // 获取真实天气数据
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?` +
      `latitude=${camera.latitude}&longitude=${camera.longitude}&` +
      `current_weather=true&` +
      `hourly=weathercode,cloudcover,relativehumidity_2m,visibility,precipitation,snowfall&` +
      `daily=sunrise,sunset&` +
      `timezone=${encodeURIComponent(camera.timezone)}&` +
      `forecast_days=1`;

    const weatherResponse = await fetch(weatherUrl);
    const weather = await weatherResponse.json();

    console.log('Current Weather Data:');
    console.log('  weathercode:', weather.current_weather?.weathercode);
    console.log('  is_day:', weather.current_weather?.is_day);
    console.log('');

    // 检查hourly数据
    const now = new Date();
    const hourIndex = weather.hourly?.time?.findIndex((t: string) => {
      const hourTime = new Date(t);
      return Math.abs(hourTime.getTime() - now.getTime()) < 1800000; // 30分钟内
    }) ?? 0;

    console.log('Hourly Data (current hour index:', hourIndex, '):');
    console.log('  visibility:', weather.hourly?.visibility?.[hourIndex], 'm');
    console.log('  cloudcover:', weather.hourly?.cloudcover?.[hourIndex], '%');
    console.log('  humidity:', weather.hourly?.relativehumidity_2m?.[hourIndex], '%');
    console.log('  precipitation:', weather.hourly?.precipitation?.[hourIndex], 'mm');
    console.log('  snowfall:', weather.hourly?.snowfall?.[hourIndex], 'mm');
    console.log('  weathercode:', weather.hourly?.weathercode?.[hourIndex]);
    console.log('');

    // 计算实际评分
    const evaluation = scoreCameraWeather(weather, now, {
      cameraMetadata: metadata,
      timezone: camera.timezone,
    });

    console.log('Current Scoring:');
    console.log('  Score:', evaluation.score);
    console.log('  Label:', evaluation.label);
    console.log('  isDaytime:', evaluation.isDaytime);
    console.log('  isClear:', evaluation.isClear);
    console.log('  weatherClass:', evaluation.weatherClass);
    console.log('');

    // 手动计算理论分数（假设完美天气）
    const perfectVisibility = 20000;
    const perfectCloudcover = 10;
    const perfectHumidity = 60;

    const vis = Math.min(1, (weather.hourly?.visibility?.[hourIndex] ?? perfectVisibility) / 20000);
    const cloud = Math.max(0, 1 - (weather.hourly?.cloudcover?.[hourIndex] ?? perfectCloudcover) / 100);
    const hum = Math.max(0, 1 - (weather.hourly?.relativehumidity_2m?.[hourIndex] ?? perfectHumidity) / 100);
    const precip = Math.max(0, 1 - (weather.hourly?.precipitation?.[hourIndex] ?? 0) / 5);
    const snow = Math.max(0, 1 - (weather.hourly?.snowfall?.[hourIndex] ?? 0) / 5);

    const qualityScore = (vis + cloud + hum + precip + snow) / 5;
    const adjustedQuality = 0.3 + 0.7 * qualityScore;
    const theoreticalScore = Math.round(70 * 1.0 * adjustedQuality * 1.0);

    console.log('Quality Analysis:');
    console.log('  Normalized visibility:', vis.toFixed(2));
    console.log('  Normalized cloudcover:', cloud.toFixed(2));
    console.log('  Normalized humidity:', hum.toFixed(2));
    console.log('  Normalized precipitation:', precip.toFixed(2));
    console.log('  Normalized snowfall:', snow.toFixed(2));
    console.log('  Average quality:', qualityScore.toFixed(2));
    console.log('  Adjusted quality:', adjustedQuality.toFixed(2));
    console.log('  Theoretical score (if label=clear-night-skyline):', theoreticalScore);
    console.log('');

    if (evaluation.score < 60) {
      console.log('⚠️ Score is below target (60-70)');
      if (evaluation.label !== 'clear-night-skyline') {
        console.log('  → Wrong label:', evaluation.label);
        console.log('     Should be: clear-night-skyline');
      }
      if (!evaluation.isClear) {
        console.log('  → Weather is not clear:', evaluation.weatherClass);
      }
      if (vis < 0.5) {
        console.log('  → Low visibility:', weather.hourly?.visibility?.[hourIndex], 'm');
      }
      if (cloud < 0.5) {
        console.log('  → High cloud cover:', weather.hourly?.cloudcover?.[hourIndex], '%');
      }
    } else {
      console.log('✅ Score is within target range (60-70)');
    }

    console.log('');
    console.log('='.repeat(60));
  }
}

checkRealWeatherData().catch(console.error);
