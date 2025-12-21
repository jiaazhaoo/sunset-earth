/**
 * 找出138号摄像头获得62分的原因
 */

import { scoreCameraWeather } from '@/lib/client-ranking-v2';
import type { CameraMetadata } from '@/lib/camera-metadata-types';

console.log('🔍 Finding Why Camera #138 Gets 62 Score\n');
console.log('='.repeat(60));

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

console.log('🎯 Hypothesis Testing:\n');
console.log('Hypothesis 1: 算法认为晚上8点仍然是"白天"');
console.log('  → 原因: 日落时间很晚 + 扩展白天定义(日落后45分钟)');
console.log('');

// 测试：如果日落是晚上7:30，那么8:00还在扩展白天范围内吗？
const testTime = new Date();
testTime.setHours(20, 0, 0, 0); // 晚上8点

// 场景1: 日落在19:30 (7:30 PM)
console.log('Scenario 1: 日落在19:30 (7:30 PM)');
const scenario1 = {
  latitude: 45.0,
  longitude: -75.0,
  timezone: 'America/Toronto',
  utc_offset_seconds: -18000,
  current_weather: {
    time: testTime.toISOString(),
    weathercode: 0,
    is_day: 0, // API说是夜晚
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
    time: [testTime.toISOString().split('T')[0]],
    sunrise: [new Date(testTime.getTime() - 14 * 3600000).toISOString()], // 早上6点日出
    sunset: [new Date(testTime.getTime() - 0.5 * 3600000).toISOString()], // 19:30日落（30分钟前）
  },
};

const result1 = scoreCameraWeather(scenario1, testTime, {
  cameraMetadata: camera138Metadata,
  timezone: 'America/Toronto',
});

console.log(`  → Score: ${result1.score}`);
console.log(`  → isDaytime: ${result1.isDaytime}`);
console.log(`  → label: ${result1.label}`);
console.log(`  → 扩展白天定义: 日落后45分钟 = 20:15`);
console.log(`  → 20:00 < 20:15 → 仍在"扩展白天"范围内！`);
console.log('');

// 场景2: 日落在19:00 (7:00 PM)
console.log('Scenario 2: 日落在19:00 (7:00 PM)');
const scenario2 = {
  ...scenario1,
  daily: {
    time: [testTime.toISOString().split('T')[0]],
    sunrise: [new Date(testTime.getTime() - 14 * 3600000).toISOString()],
    sunset: [new Date(testTime.getTime() - 1 * 3600000).toISOString()], // 19:00日落（1小时前）
  },
};

const result2 = scoreCameraWeather(scenario2, testTime, {
  cameraMetadata: camera138Metadata,
  timezone: 'America/Toronto',
});

console.log(`  → Score: ${result2.score}`);
console.log(`  → isDaytime: ${result2.isDaytime}`);
console.log(`  → label: ${result2.label}`);
console.log('');

// 场景3: 日落在20:15 (8:15 PM) - 极端情况（北欧夏季）
console.log('Scenario 3: 日落在20:15 (8:15 PM) - 北欧夏季');
const scenario3 = {
  ...scenario1,
  daily: {
    time: [testTime.toISOString().split('T')[0]],
    sunrise: [new Date(testTime.getTime() - 16 * 3600000).toISOString()], // 早上4点日出
    sunset: [new Date(testTime.getTime() + 0.25 * 3600000).toISOString()], // 20:15日落（15分钟后）
  },
};

const result3 = scoreCameraWeather(scenario3, testTime, {
  cameraMetadata: camera138Metadata,
  timezone: 'Europe/Oslo',
});

console.log(`  → Score: ${result3.score}`);
console.log(`  → isDaytime: ${result3.isDaytime}`);
console.log(`  → label: ${result3.label}`);
console.log('');

console.log('='.repeat(60));
console.log('\n💡 Analysis:\n');

if (result1.score > 50) {
  console.log('✅ FOUND IT! 场景1复现了62分问题:');
  console.log('');
  console.log('问题根源:');
  console.log('  1. 算法v2定义"白天" = 日出前45分钟 到 日落后45分钟');
  console.log('  2. 如果日落在19:30，那么20:00仍然算"白天"');
  console.log('  3. ski-resort的dayOnly惩罚不生效（因为算法认为是白天）');
  console.log('  4. 所以得到正常的白天分数 ~60分');
  console.log('');
  console.log('问题在于:');
  console.log('  - current_weather.is_day = 0 (天气API说是夜晚)');
  console.log('  - 但算法v2根据日落+45分钟判断仍是"白天"');
  console.log('  - 两个定义冲突！');
}

console.log('');
console.log('='.repeat(60));
console.log('\n🔧 Potential Solutions:\n');

console.log('方案A: 信任天气API的is_day判断');
console.log('  - 当is_day=0时，强制认为是夜晚');
console.log('  - 缺点: is_day可能不准确');
console.log('');

console.log('方案B: 缩小"扩展白天"定义');
console.log('  - 从日落后45分钟改为日落后30分钟');
console.log('  - 或者改为日落后15分钟');
console.log('  - 缺点: 可能影响黄金时刻的判断');
console.log('');

console.log('方案C: dayOnly摄像头使用严格的白天定义');
console.log('  - 对于dayOnly摄像头，白天定义 = 日出到日落（不扩展）');
console.log('  - 对于其他摄像头，仍使用扩展定义');
console.log('  - 优点: 针对性解决，不影响其他逻辑');
console.log('');

console.log('方案D: 双重检查');
console.log('  - isDaytime = (扩展定义 && is_day === 1) || 严格定义');
console.log('  - 只有在扩展范围内 且 is_day=1 时才算白天');
console.log('  - 优点: 结合了两种判断方式');
console.log('');
