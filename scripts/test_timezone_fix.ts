/**
 * 测试时区解析修复
 *
 * 这个测试验证parseUtcDate修复后，日期解析是否正确
 */

import { scoreCameraWeather } from '@/lib/client-ranking-v2';
import type { CameraMetadata } from '@/lib/camera-metadata-types';

console.log('🧪 Testing Timezone Parsing Fix\n');
console.log('='.repeat(60));

const skiResortMetadata: CameraMetadata = {
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

// Test Case 1: 东京时区 (UTC+9)
console.log('Test 1: Tokyo Timezone (UTC+9)');
console.log('-'.repeat(60));

const tokyoTime = new Date('2025-12-19T17:55:00+09:00'); // 17:55 JST

const tokyoWeather = {
  latitude: 36.7833,
  longitude: 139.4167,
  timezone: 'Asia/Tokyo',
  utc_offset_seconds: 32400,
  current_weather: {
    time: tokyoTime.toISOString(),
    weathercode: 0,
    is_day: 0,
  },
  hourly: {
    time: [tokyoTime.toISOString()],
    weathercode: [0],
    cloudcover: [10],
    relativehumidity_2m: [60],
    visibility: [20000],
    precipitation: [0],
    snowfall: [0],
  },
  daily: {
    time: ['2025-12-19'],
    sunrise: ['2025-12-19T06:49'], // 本地时间（无时区后缀）
    sunset: ['2025-12-19T16:28'],  // 本地时间（无时区后缀）
  },
};

const tokyoResult = scoreCameraWeather(tokyoWeather, tokyoTime, {
  cameraMetadata: skiResortMetadata,
  timezone: 'Asia/Tokyo',
});

console.log('Input:');
console.log('  Time: 17:55 JST');
console.log('  Sunset: 16:28 JST');
console.log('  Extended day end: 17:13 JST');
console.log('  17:55 > 17:13 → Should be NIGHT');
console.log('');
console.log('Result:');
console.log('  Score:', tokyoResult.score);
console.log('  isDaytime:', tokyoResult.isDaytime);
console.log('  Label:', tokyoResult.label);
console.log('');

if (tokyoResult.score < 10 && tokyoResult.isDaytime === false) {
  console.log('✅ PASS: Tokyo timezone handled correctly');
} else {
  console.log('❌ FAIL: Expected score < 10 and isDaytime = false');
  console.log('   Got: score =', tokyoResult.score, 'isDaytime =', tokyoResult.isDaytime);
}

console.log('\n' + '='.repeat(60) + '\n');

// Test Case 2: 纽约时区 (UTC-5)
console.log('Test 2: New York Timezone (UTC-5)');
console.log('-'.repeat(60));

const nyTime = new Date('2025-12-19T20:00:00-05:00'); // 20:00 EST

const nyWeather = {
  latitude: 40.7128,
  longitude: -74.0060,
  timezone: 'America/New_York',
  utc_offset_seconds: -18000,
  current_weather: {
    time: nyTime.toISOString(),
    weathercode: 0,
    is_day: 0,
  },
  hourly: {
    time: [nyTime.toISOString()],
    weathercode: [0],
    cloudcover: [10],
    relativehumidity_2m: [60],
    visibility: [20000],
    precipitation: [0],
    snowfall: [0],
  },
  daily: {
    time: ['2025-12-19'],
    sunrise: ['2025-12-19T07:15'], // 本地时间
    sunset: ['2025-12-19T16:32'],  // 本地时间
  },
};

const nyResult = scoreCameraWeather(nyWeather, nyTime, {
  cameraMetadata: skiResortMetadata,
  timezone: 'America/New_York',
});

console.log('Input:');
console.log('  Time: 20:00 EST');
console.log('  Sunset: 16:32 EST');
console.log('  Extended day end: 17:17 EST');
console.log('  20:00 > 17:17 → Should be NIGHT');
console.log('');
console.log('Result:');
console.log('  Score:', nyResult.score);
console.log('  isDaytime:', nyResult.isDaytime);
console.log('  Label:', nyResult.label);
console.log('');

if (nyResult.score < 10 && nyResult.isDaytime === false) {
  console.log('✅ PASS: New York timezone handled correctly');
} else {
  console.log('❌ FAIL: Expected score < 10 and isDaytime = false');
  console.log('   Got: score =', nyResult.score, 'isDaytime =', nyResult.isDaytime);
}

console.log('\n' + '='.repeat(60) + '\n');

// Test Case 3: 白天时间（应该高分）
console.log('Test 3: Daytime (should have high score)');
console.log('-'.repeat(60));

const daytimeTokyoTime = new Date('2025-12-19T12:00:00+09:00'); // 12:00 JST

const daytimeWeather = {
  ...tokyoWeather,
  current_weather: {
    time: daytimeTokyoTime.toISOString(),
    weathercode: 0,
    is_day: 1,
  },
  hourly: {
    ...tokyoWeather.hourly,
    time: [daytimeTokyoTime.toISOString()],
  },
};

const daytimeResult = scoreCameraWeather(daytimeWeather, daytimeTokyoTime, {
  cameraMetadata: skiResortMetadata,
  timezone: 'Asia/Tokyo',
});

console.log('Input:');
console.log('  Time: 12:00 JST (midday)');
console.log('  Sunrise: 06:49, Sunset: 16:28');
console.log('  Should be DAYTIME');
console.log('');
console.log('Result:');
console.log('  Score:', daytimeResult.score);
console.log('  isDaytime:', daytimeResult.isDaytime);
console.log('  Label:', daytimeResult.label);
console.log('');

if (daytimeResult.score > 40 && daytimeResult.isDaytime === true) {
  console.log('✅ PASS: Daytime score is high');
} else {
  console.log('❌ FAIL: Expected score > 40 and isDaytime = true');
  console.log('   Got: score =', daytimeResult.score, 'isDaytime =', daytimeResult.isDaytime);
}

console.log('\n' + '='.repeat(60) + '\n');

// Summary
console.log('📋 Test Summary\n');

const tests = [
  { name: 'Tokyo Night', passed: tokyoResult.score < 10 && tokyoResult.isDaytime === false },
  { name: 'NY Night', passed: nyResult.score < 10 && nyResult.isDaytime === false },
  { name: 'Tokyo Day', passed: daytimeResult.score > 40 && daytimeResult.isDaytime === true },
];

const passed = tests.filter(t => t.passed).length;
const total = tests.length;

console.log(`Total: ${total}`);
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${total - passed}`);
console.log('');

if (passed === total) {
  console.log('✅ All timezone tests passed! The fix is working correctly.');
} else {
  console.log('❌ Some tests failed. Details:');
  tests.forEach(t => {
    console.log(`  ${t.passed ? '✅' : '❌'} ${t.name}`);
  });
}
console.log('');
