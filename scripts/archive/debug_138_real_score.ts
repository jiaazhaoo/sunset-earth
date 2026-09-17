/**
 * Debug: 实际测试138号摄像头的真实评分
 */

import { scoreCameraWeather } from '@/lib/client-ranking-v2';
import type { CameraMetadata } from '@/lib/camera-metadata-types';

console.log('🔍 Debug Camera #138 Real Scoring\n');
console.log('='.repeat(60));

// 138号摄像头的真实元数据（从迁移SQL中获取）
const camera138Metadata: CameraMetadata = {
  primaryType: 'ski-resort',
  isFarpoint: false,
  tier: 't1',
  resolution: '1080p',
  viewingTime: {
    dayOnly: true,
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

console.log('📋 Camera #138 Metadata:');
console.log(JSON.stringify(camera138Metadata, null, 2));
console.log('');

// 模拟晚上的天气数据
const now = new Date();
now.setHours(20, 0, 0, 0); // 晚上8点

// 构造完整的天气数据
const nightWeather = {
  latitude: 45.0,
  longitude: -75.0,
  timezone: 'America/Toronto',
  utc_offset_seconds: -18000,
  current_weather: {
    time: now.toISOString(),
    weathercode: 0,
    is_day: 0, // ← 夜晚
  },
  hourly: {
    time: [now.toISOString()],
    weathercode: [0], // clear
    cloudcover: [10],
    relativehumidity_2m: [60],
    visibility: [20000], // 高能见度
    precipitation: [0],
    snowfall: [0],
  },
  daily: {
    time: [now.toISOString().split('T')[0]],
    sunrise: [new Date(now.getTime() - 12 * 3600000).toISOString()], // 12小时前日出
    sunset: [new Date(now.getTime() - 2 * 3600000).toISOString()], // 2小时前日落
  },
};

console.log('🌙 Testing Night Scoring (20:00, clear, is_day=0):');
console.log('');

const evaluation = scoreCameraWeather(nightWeather, now, {
  cameraMetadata: camera138Metadata,
  timezone: 'America/Toronto',
});

console.log('📊 Evaluation Result:');
console.log('  Score:', evaluation.score);
console.log('  Label:', evaluation.label);
console.log('  Is Daytime:', evaluation.isDaytime);
console.log('  Weather Class:', evaluation.weatherClass);
console.log('  Distance Minutes:', evaluation.distanceMinutes);
console.log('  Is Clear:', evaluation.isClear);
console.log('');

console.log('='.repeat(60));
console.log('\n🔍 Analysis:\n');

if (evaluation.score > 10) {
  console.log('❌ PROBLEM: Score is', evaluation.score, '(expected < 5)');
  console.log('');
  console.log('Possible reasons:');
  console.log('');

  if (evaluation.isDaytime === true) {
    console.log('  ⚠️ Algorithm thinks it\'s DAYTIME!');
    console.log('     - current_weather.is_day:', nightWeather.current_weather.is_day);
    console.log('     - evaluation.isDaytime:', evaluation.isDaytime);
    console.log('     → BUG: isDaytime detection is wrong');
  } else if (evaluation.isDaytime === null) {
    console.log('  ⚠️ isDaytime is NULL (not determined)');
    console.log('     - When isDaytime is null, dayOnly penalty might not apply');
  } else {
    console.log('  ✅ isDaytime correctly detected as:', evaluation.isDaytime);
    console.log('     → dayOnly penalty SHOULD have applied (×0.1)');
    console.log('     → But score is still high, so penalty didn\'t work');
  }

  console.log('');
  console.log('  Checking time tier:', evaluation.label);
  if (evaluation.label && evaluation.label !== 'night') {
    console.log('     → Time tier is NOT "night", base score might be high');
  }
} else {
  console.log('✅ Score is correctly low:', evaluation.score);
}

console.log('');
console.log('='.repeat(60));
console.log('\n🧪 Testing Multiple Scenarios:\n');

const scenarios = [
  {
    name: 'Daytime (12:00, is_day=1)',
    hour: 12,
    is_day: 1,
    sunriseOffset: -6,
    sunsetOffset: 6,
  },
  {
    name: 'Night (20:00, is_day=0)',
    hour: 20,
    is_day: 0,
    sunriseOffset: -14,
    sunsetOffset: -2,
  },
  {
    name: 'Late Night (23:00, is_day=0)',
    hour: 23,
    is_day: 0,
    sunriseOffset: -17,
    sunsetOffset: -5,
  },
  {
    name: 'Golden Hour Sunset (18:30, is_day=1)',
    hour: 18.5,
    is_day: 1,
    sunriseOffset: -12,
    sunsetOffset: 0.5,
  },
];

for (const scenario of scenarios) {
  const testTime = new Date();
  testTime.setHours(Math.floor(scenario.hour), (scenario.hour % 1) * 60, 0, 0);

  const testWeather = {
    ...nightWeather,
    current_weather: {
      time: testTime.toISOString(),
      weathercode: 0,
      is_day: scenario.is_day,
    },
    hourly: {
      ...nightWeather.hourly,
      time: [testTime.toISOString()],
    },
    daily: {
      time: [testTime.toISOString().split('T')[0]],
      sunrise: [new Date(testTime.getTime() + scenario.sunriseOffset * 3600000).toISOString()],
      sunset: [new Date(testTime.getTime() + scenario.sunsetOffset * 3600000).toISOString()],
    },
  };

  const result = scoreCameraWeather(testWeather, testTime, {
    cameraMetadata: camera138Metadata,
    timezone: 'America/Toronto',
  });

  console.log(`${scenario.name}:`);
  console.log(`  Score: ${result.score}, isDaytime: ${result.isDaytime}, label: ${result.label}`);
}

console.log('');
