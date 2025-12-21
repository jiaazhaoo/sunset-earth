/**
 * 调试城市天际线评分计算过程
 */

import { scoreCameraWeather } from '@/lib/client-ranking-v2';
import type { CameraMetadata } from '@/lib/camera-metadata-types';

const t0SkylineMetadata: CameraMetadata = {
  primaryType: 'city-skyline',
  isFarpoint: false,
  tier: 't0',
  resolution: '4k',
  viewingTime: {
    dayOnly: false,
    nightOnly: false,
    noSleepTime: false,
    anytime: true, // ← 关键：允许任何时间
  },
  weatherTolerance: {
    clear: true,
    partlyCloudy: true,
    lightRain: false,
    lightSnow: true,
  },
};

console.log('🌃 Debugging City Skyline Scoring\n');
console.log('='.repeat(60));

// 模拟晴朗夜晚
const nightTime = new Date();
nightTime.setHours(22, 0, 0, 0); // 晚上10点

const clearNightWeather = {
  latitude: 40.7128,
  longitude: -74.0060,
  timezone: 'America/New_York',
  utc_offset_seconds: -18000,
  current_weather: {
    time: nightTime.toISOString(),
    weathercode: 0, // clear
    is_day: 0, // night
  },
  hourly: {
    time: [nightTime.toISOString()],
    weathercode: [0],
    cloudcover: [5],
    relativehumidity_2m: [60],
    visibility: [20000],
    precipitation: [0],
    snowfall: [0],
  },
  daily: {
    time: [nightTime.toISOString().split('T')[0]],
    sunrise: [new Date(nightTime.getTime() - 16 * 3600000).toISOString().split('.')[0]], // 16小时前
    sunset: [new Date(nightTime.getTime() - 4 * 3600000).toISOString().split('.')[0]],   // 4小时前
  },
};

console.log('Test Case: t0 City Skyline, Clear Night\n');

const evaluation = scoreCameraWeather(clearNightWeather, nightTime, {
  cameraMetadata: t0SkylineMetadata,
  timezone: 'America/New_York',
});

console.log('Result:');
console.log('  Score:', evaluation.score);
console.log('  Label:', evaluation.label);
console.log('  isDaytime:', evaluation.isDaytime);
console.log('  isClear:', evaluation.isClear);
console.log('  weatherClass:', evaluation.weatherClass);
console.log('');

console.log('='.repeat(60));
console.log('\n分析评分计算过程:\n');

console.log('预期计算:');
console.log('  基础分 (Tier 5): 70');
console.log('  天气适配度: 1.0 (clear)');
console.log('  质量分数: ~0.95 (高能见度)');
console.log('  调整质量: 0.3 + 0.7 * 0.95 = 0.965');
console.log('  特殊惩罚: 1.0 (无惩罚)');
console.log('');
console.log('  最终分数 = 70 × 1.0 × 0.965 × 1.0 = 67.55 ≈ 68');
console.log('');

console.log('实际得分:', evaluation.score);
console.log('差异:', 68 - evaluation.score);
console.log('');

if (evaluation.score < 60) {
  console.log('❌ 分数太低！可能的原因:');
  console.log('  1. Label不是"clear-night-skyline"，用了更低的tier');
  console.log('     实际label:', evaluation.label);
  console.log('  2. 有额外的惩罚因子被应用');
  console.log('  3. 天气权重被降低');
  console.log('');

  if (evaluation.label !== 'clear-night-skyline') {
    console.log('  → 问题确认: Label错误');
    console.log('     应该是: clear-night-skyline');
    console.log('     实际是:', evaluation.label);
    console.log('');
    console.log('  可能原因:');
    console.log('    - isDaytime判断错误:', evaluation.isDaytime);
    console.log('    - isClear判断错误:', evaluation.isClear);
    console.log('    - metadata.viewingTime.anytime:', t0SkylineMetadata.viewingTime.anytime);
  }
} else if (evaluation.score >= 60 && evaluation.score < 70) {
  console.log('⚠️ 分数接近预期但略低');
  console.log('  可能有轻微的惩罚或质量降低');
} else {
  console.log('✅ 分数正常');
}

console.log('');
console.log('='.repeat(60));
console.log('\n💡 建议:\n');

if (evaluation.score < 60) {
  console.log('基础分70可能还不够，考虑:');
  console.log('  方案A: 提升到75分');
  console.log('  方案B: 为t0/t1的skyline添加额外加成');
  console.log('  方案C: 检查是否有不必要的惩罚因子');
}

console.log('');
