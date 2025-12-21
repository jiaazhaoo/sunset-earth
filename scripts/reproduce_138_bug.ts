/**
 * 复现138号摄像头在17:55仍得62分的问题
 */

import { scoreCameraWeather } from '@/lib/client-ranking-v2';
import type { CameraMetadata } from '@/lib/camera-metadata-types';

console.log('🐛 Reproducing Camera #138 Bug (62 score at 17:55)\n');
console.log('='.repeat(60));

// 138号摄像头的元数据
const camera138Metadata: CameraMetadata = {
  primaryType: 'ski-resort',
  isFarpoint: false,
  tier: 't1',
  resolution: '1080p',
  viewingTime: {
    dayOnly: true,  // ← 关键：仅白天
    nightOnly: false,
    noSleepTime: false,
    anytime: false,
  },
  weatherTolerance: {
    clear: true,
    partlyCloudy: true,
    lightRain: false,
    lightSnow: true,
  },
};

console.log('📋 Camera #138 Info:');
console.log('  Location: Japan (36.78°N, 139.42°E)');
console.log('  Timezone: Asia/Tokyo');
console.log('  Type: ski-resort (dayOnly: true)');
console.log('');

// 模拟今天（2025-12-19）的天气数据
const testTime = new Date('2025-12-19T17:55:00+09:00'); // 17:55 JST

const weatherData = {
  latitude: 36.7833,
  longitude: 139.4167,
  timezone: 'Asia/Tokyo',
  utc_offset_seconds: 32400,
  current_weather: {
    time: testTime.toISOString(),
    weathercode: 0,
    is_day: 0, // 天气API说是夜晚
  },
  hourly: {
    time: [testTime.toISOString()],
    weathercode: [0], // clear
    cloudcover: [10],
    relativehumidity_2m: [60],
    visibility: [20000],
    precipitation: [0],
    snowfall: [0],
  },
  daily: {
    time: ['2025-12-19'],
    sunrise: ['2025-12-19T06:49:00+09:00'], // 06:49 JST
    sunset: ['2025-12-19T16:28:00+09:00'],  // 16:28 JST
  },
};

console.log('📅 Test Scenario:');
console.log('  Date: 2025-12-19');
console.log('  Time: 17:55 JST (5:55 PM)');
console.log('  Sunrise: 06:49 JST');
console.log('  Sunset: 16:28 JST');
console.log('  Weather: Clear (weathercode 0)');
console.log('  is_day: 0 (API says it\'s night)');
console.log('');

console.log('⏰ Time Analysis:');
console.log('  Sunset: 16:28');
console.log('  Extended daytime end: 16:28 + 45min = 17:13');
console.log('  Test time: 17:55');
console.log('  17:55 > 17:13 → Should be NIGHT');
console.log('');

console.log('='.repeat(60));
console.log('\n🧪 Running Algorithm v2:\n');

const evaluation = scoreCameraWeather(weatherData, testTime, {
  cameraMetadata: camera138Metadata,
  timezone: 'Asia/Tokyo',
});

console.log('📊 Result:');
console.log('  Score:', evaluation.score);
console.log('  Label:', evaluation.label);
console.log('  Is Daytime:', evaluation.isDaytime);
console.log('  Weather Class:', evaluation.weatherClass);
console.log('  Is Clear:', evaluation.isClear);
console.log('');

console.log('='.repeat(60));
console.log('\n🔍 Analysis:\n');

if (evaluation.score > 50) {
  console.log('❌ BUG CONFIRMED! Score is', evaluation.score);
  console.log('');
  console.log('Expected: ~2-5 (dayOnly penalty should apply)');
  console.log('Actual:', evaluation.score);
  console.log('');

  if (evaluation.isDaytime === true) {
    console.log('🔴 ROOT CAUSE: isDaytime is TRUE (should be FALSE)');
    console.log('');
    console.log('The algorithm incorrectly thinks 17:55 is still daytime!');
    console.log('');
    console.log('Possible reasons:');
    console.log('  1. Blue hour window (16:28+60min to 16:28+90min = 17:28 to 17:58)');
    console.log('     → If in blue hour, isDaytime might be set incorrectly');
    console.log('  2. Extended golden hour window issue');
    console.log('  3. Time tier resolution logic bug');
  } else if (evaluation.isDaytime === false) {
    console.log('🟡 isDaytime is correctly FALSE, but score is still high');
    console.log('');
    console.log('This means dayOnly penalty did NOT apply!');
    console.log('Possible reasons:');
    console.log('  1. dayOnly penalty logic has a bug');
    console.log('  2. Penalty is being overridden by something else');
    console.log('  3. Base score is too high (>600) so even ×0.1 = 60+');
  } else {
    console.log('🟠 isDaytime is NULL (not determined)');
    console.log('');
    console.log('dayOnly penalty might not apply when isDaytime is null');
  }

  console.log('');
  console.log('Label:', evaluation.label);
  if (evaluation.label === 'blue-hour-sunset') {
    console.log('  → Blue hour detected (17:28-17:58)');
    console.log('  → Base score for blue hour is 95');
    console.log('  → This might explain the high score');
  }
} else {
  console.log('✅ Working correctly! Score is', evaluation.score);
}

console.log('');
console.log('='.repeat(60));
console.log('\n💡 Next Steps:\n');

console.log('If bug confirmed:');
console.log('  1. Check if blue hour (17:28-17:58) is being treated as "daytime"');
console.log('  2. Verify dayOnly penalty is being applied correctly');
console.log('  3. Consider: Should dayOnly cameras get 0 score during blue hour?');
console.log('');
