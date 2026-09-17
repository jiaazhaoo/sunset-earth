/**
 * Debug白天测试失败的原因
 */

import { scoreCameraWeather } from '@/lib/client-ranking-v2';
import type { CameraMetadata } from '@/lib/camera-metadata-types';

const metadata: CameraMetadata = {
  primaryType: 'ski-resort',
  isFarpoint: false,
  tier: 't1',
  resolution: '1080p',
  viewingTime: { dayOnly: true, nightOnly: false, noSleepTime: false, anytime: false },
  weatherTolerance: { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true },
};

const testTime = new Date('2025-12-19T12:00:00+09:00'); // 12:00 JST
console.log('Test time:', testTime.toISOString());
console.log('Test time JST:', testTime.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));

const weather = {
  latitude: 36.7833,
  longitude: 139.4167,
  timezone: 'Asia/Tokyo',
  utc_offset_seconds: 32400,
  current_weather: {
    time: testTime.toISOString(),
    weathercode: 0,
    is_day: 1, // 白天
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
    time: ['2025-12-19'],
    sunrise: ['2025-12-19T06:49'], // 本地时间
    sunset: ['2025-12-19T16:28'],  // 本地时间
  },
};

console.log('\nWeather data:');
console.log('  Sunrise:', weather.daily.sunrise[0]);
console.log('  Sunset:', weather.daily.sunset[0]);
console.log('  Current time:', weather.current_weather.time);
console.log('');

const result = scoreCameraWeather(weather, testTime, {
  cameraMetadata: metadata,
  timezone: 'Asia/Tokyo',
});

console.log('Result:');
console.log('  Score:', result.score);
console.log('  isDaytime:', result.isDaytime);
console.log('  Label:', result.label);
console.log('');

// 手动验证时间解析
console.log('Manual verification:');
const sunrise = new Date('2025-12-19T06:49'); // 本地解析（错误）
const sunriseUTC = new Date('2025-12-19T06:49Z'); // UTC解析
console.log('  Sunrise (local parse):', sunrise.toISOString(), '→', sunrise.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
console.log('  Sunrise (UTC parse):', sunriseUTC.toISOString(), '→', sunriseUTC.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
console.log('  Test time:', testTime.toISOString(), '→', testTime.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
console.log('');
console.log('  12:00 JST should be between 06:49 JST and 16:28 JST');
