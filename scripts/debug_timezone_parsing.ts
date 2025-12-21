/**
 * 调试parseDateInTimezone函数在实际场景中的工作情况
 */

import { scoreCameraWeather } from '@/lib/client-ranking-v2';
import type { CameraMetadata } from '@/lib/camera-metadata-types';

console.log('🔍 Debugging parseDateInTimezone in Real Scenario\n');
console.log('='.repeat(60));

// 测试场景：纽约时区，晚上10点（日落后4小时）
const testTime = new Date('2025-12-21T22:00:00-05:00'); // 22:00 EST

const citySkylineMetadata: CameraMetadata = {
  primaryType: 'city-skyline',
  isFarpoint: false,
  tier: 't0',
  resolution: '1080p',
  viewingTime: {
    dayOnly: false,
    nightOnly: false,
    noSleepTime: false,
    anytime: true,  // 城市天际线可以全天候
  },
  weatherTolerance: {
    clear: true,
    partlyCloudy: true,
    lightRain: false,
    lightSnow: false,
  },
};

// 模拟Open-Meteo返回的天气数据
// 注意：日落时间是本地时间字符串（无时区后缀）
const weather = {
  latitude: 40.7128,
  longitude: -74.0060,
  timezone: 'America/New_York',
  utc_offset_seconds: -18000,
  current_weather: {
    time: testTime.toISOString(),
    weathercode: 0,  // clear
    is_day: 0,       // night
  },
  hourly: {
    time: [testTime.toISOString()],
    weathercode: [0],
    cloudcover: [10],
    relativehumidity_2m: [60],
    visibility: [20000],
    precipitation: [0],
    snowfall: [0],
  },
  daily: {
    time: ['2025-12-21'],
    sunrise: ['2025-12-21T07:15'],  // 本地时间 07:15 EST (无时区后缀!)
    sunset: ['2025-12-21T16:32'],   // 本地时间 16:32 EST (无时区后缀!)
  },
};

console.log('📊 Test Input:\n');
console.log('  Current time: 22:00 EST (2025-12-21T22:00:00-05:00)');
console.log('  Sunset string: "2025-12-21T16:32" (本地时间，无时区)');
console.log('  Timezone: America/New_York');
console.log('');

console.log('📐 Expected Behavior:\n');
console.log('  1. Sunset should be parsed as: 16:32 EST = 21:32 UTC');
console.log('  2. Current time: 22:00 EST = 03:00 UTC (next day)');
console.log('  3. Extended daytime ends at: 17:17 EST = 22:17 UTC');
console.log('  4. 22:00 EST > 17:17 EST → Should be NIGHT');
console.log('  5. isDaytime should be: false');
console.log('  6. Label should be: "clear-night-skyline"');
console.log('  7. Score should be: 60-70');
console.log('');

console.log('🧪 Running scoreCameraWeather...\n');

const result = scoreCameraWeather(weather, testTime, {
  cameraMetadata: citySkylineMetadata,
  timezone: 'America/New_York',
});

console.log('📈 Actual Result:\n');
console.log('  Score:', result.score);
console.log('  Label:', result.label);
console.log('  isDaytime:', result.isDaytime);
console.log('  isClear:', result.isClear);
console.log('  weatherClass:', result.weatherClass);
console.log('');

console.log('='.repeat(60));
console.log('\n✅ Validation:\n');

const checks = [
  {
    name: 'isDaytime is false',
    pass: result.isDaytime === false,
    expected: false,
    actual: result.isDaytime,
  },
  {
    name: 'Label is clear-night-skyline',
    pass: result.label === 'clear-night-skyline',
    expected: 'clear-night-skyline',
    actual: result.label,
  },
  {
    name: 'Score is 60-70',
    pass: result.score >= 60 && result.score <= 70,
    expected: '60-70',
    actual: result.score,
  },
];

checks.forEach(check => {
  const icon = check.pass ? '✅' : '❌';
  console.log(`  ${icon} ${check.name}`);
  if (!check.pass) {
    console.log(`     Expected: ${check.expected}`);
    console.log(`     Actual: ${check.actual}`);
  }
});

console.log('');

const allPassed = checks.every(c => c.pass);
if (allPassed) {
  console.log('✅ All checks passed! Timezone parsing is working correctly.');
} else {
  console.log('❌ Some checks failed. Timezone parsing may have issues.');
  console.log('');
  console.log('💡 Debug Hints:');

  if (result.isDaytime !== false) {
    console.log('  → isDaytime is true when it should be false');
    console.log('    Possible cause: sunset Date object was not parsed correctly');
    console.log('    Check: parseDateInTimezone may be treating "2025-12-21T16:32" as UTC');
  }

  if (result.label !== 'clear-night-skyline') {
    console.log('  → Wrong label: ' + result.label);
    console.log('    Possible cause: isDaytime=true prevents reaching Tier 5 logic');
    console.log('    Or: Matching a higher priority window incorrectly');
  }

  if (result.score < 60 || result.score > 70) {
    console.log('  → Score out of range: ' + result.score);
    console.log('    Possible cause: Wrong tier or additional penalties');
  }
}

console.log('');

// 额外调试：手动测试parseDateInTimezone
console.log('='.repeat(60));
console.log('\n🔬 Manual parseDateInTimezone Test:\n');

// 我们需要导出parseDateInTimezone函数进行测试
// 但由于它是私有函数，我们通过侧面验证
console.log('Testing sunset parsing behavior:');
console.log('  Input: "2025-12-21T16:32"');
console.log('  Timezone: America/New_York');
console.log('');

// 创建预期的正确解析结果
const correctSunsetEST = new Date('2025-12-21T16:32:00-05:00');
console.log('  Correct interpretation: 16:32 EST');
console.log('  → UTC timestamp:', correctSunsetEST.toISOString());
console.log('  → Unix ms:', correctSunsetEST.getTime());
console.log('');

// 错误的解析结果（如果当作UTC）
const wrongSunsetUTC = new Date('2025-12-21T16:32:00Z');
console.log('  Wrong interpretation: 16:32 UTC');
console.log('  → UTC timestamp:', wrongSunsetUTC.toISOString());
console.log('  → Unix ms:', wrongSunsetUTC.getTime());
console.log('  → EST equivalent:', wrongSunsetUTC.toLocaleString('en-US', { timeZone: 'America/New_York' }));
console.log('');

// 计算扩展白天结束时间
const correctDayEnd = new Date(correctSunsetEST.getTime() + 45 * 60000);
const wrongDayEnd = new Date(wrongSunsetUTC.getTime() + 45 * 60000);

console.log('Extended daytime end (correct):');
console.log('  16:32 EST + 45min = 17:17 EST');
console.log('  → UTC:', correctDayEnd.toISOString());
console.log('  → 22:00 EST > 17:17 EST? true (correctly NIGHT)');
console.log('');

console.log('Extended daytime end (if wrong):');
console.log('  16:32 UTC + 45min = 17:17 UTC');
console.log('  → EST:', wrongDayEnd.toLocaleString('en-US', { timeZone: 'America/New_York' }));
console.log('  → 22:00 EST > 12:17 EST? true (but wrong sunset time!)');
console.log('');

console.log('If result.isDaytime = true, then parseDateInTimezone is likely using the WRONG interpretation.');
console.log('');
