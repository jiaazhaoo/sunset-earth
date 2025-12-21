/**
 * 追踪城市天际线评分计算的每一步
 */

console.log('🔬 Tracing Scoring Calculation Step-by-Step\n');
console.log('='.repeat(60));

// 手动复现评分计算逻辑

const testCase = {
  tier: 5,  // clear-night-skyline
  weatherClass: 'clear' as const,
  cloudcover: 10,
  visibility: 20000,
  humidity: 60,
  precipitation: 0,
  snowfall: 0,
  isFarpoint: false,
  weatherTolerance: {
    clear: true,
    partlyCloudy: true,
    lightRain: false,
    lightSnow: true,
  },
  isDaytime: false,
  noSleepTime: false,
  localHour: 22,  // 22:00
};

console.log('📊 Input:\n');
console.log('  Tier:', testCase.tier, '(clear-night-skyline)');
console.log('  Weather class:', testCase.weatherClass);
console.log('  Visibility:', testCase.visibility, 'm');
console.log('  Cloud cover:', testCase.cloudcover, '%');
console.log('  Humidity:', testCase.humidity, '%');
console.log('  Precipitation:', testCase.precipitation, 'mm');
console.log('  Snowfall:', testCase.snowfall, 'mm');
console.log('  isFarpoint:', testCase.isFarpoint);
console.log('  isDaytime:', testCase.isDaytime);
console.log('  Local hour:', testCase.localHour);
console.log('');

// Step 1: 时间基础分
console.log('Step 1: Time Base Score');
console.log('-'.repeat(60));

const timeScores: Record<number, number> = {
  1: 100,
  2: 95,
  3: 85,
  4: 70,
  5: 70,  // ← clear-night-skyline
  6: 30,
};

const baseScore = timeScores[testCase.tier];
console.log('  timeScores[5] =', baseScore);
console.log('');

// Step 2: 天气适配度
console.log('Step 2: Weather Weight');
console.log('-'.repeat(60));

function getWeatherWeight(weatherClass: string, tolerance: any): number {
  const weights: Record<string, number> = {
    'clear': 1.0,
    'partly-cloudy': 0.9,
    'light-rain': 0.7,
    'moderate-rain': 0.5,
    'heavy-rain': 0.3,
    'light-snow': 0.8,
    'moderate-snow': 0.6,
    'heavy-snow': 0.4,
  };

  const weight = weights[weatherClass] ?? 0.5;

  // 检查容忍度
  const toleranceMap: Record<string, keyof typeof tolerance> = {
    'clear': 'clear',
    'partly-cloudy': 'partlyCloudy',
    'light-rain': 'lightRain',
    'moderate-rain': 'lightRain',
    'heavy-rain': 'lightRain',
    'light-snow': 'lightSnow',
    'moderate-snow': 'lightSnow',
    'heavy-snow': 'lightSnow',
  };

  const key = toleranceMap[weatherClass];
  if (key && !tolerance[key]) {
    return weight * 0.5;  // 不容忍的天气减半
  }

  return weight;
}

const weatherWeight = getWeatherWeight(testCase.weatherClass, testCase.weatherTolerance);
console.log('  Weather class:', testCase.weatherClass);
console.log('  Base weight:', 1.0);
console.log('  Tolerance check: clear =', testCase.weatherTolerance.clear, '→ No penalty');
console.log('  Final weatherWeight =', weatherWeight);
console.log('');

// Step 3: 质量分数
console.log('Step 3: Quality Score');
console.log('-'.repeat(60));

function normalizePositive(value: number | undefined, max: number) {
  if (value === undefined || value === null) return null;
  return Math.max(0, Math.min(1, value / max));
}

function normalizeNegative(value: number | undefined, max: number) {
  if (value === undefined || value === null) return null;
  return Math.max(0, Math.min(1, 1 - value / max));
}

function buildQualityScore(inputs: {
  visibility?: number;
  humidity?: number;
  precipitation?: number;
  snowfall?: number;
  cloudcover?: number;
}, isFarpoint: boolean): number {
  const vis = normalizePositive(inputs.visibility, 20000);
  const hum = normalizeNegative(inputs.humidity, 100);
  const precip = normalizeNegative(inputs.precipitation, 5);
  const snow = normalizeNegative(inputs.snowfall, 5);
  const cloud = normalizeNegative(inputs.cloudcover, 100);

  console.log('  Normalized factors:');
  console.log('    Visibility:', vis, `(${inputs.visibility}/20000)`);
  console.log('    Humidity:', hum, `(100-${inputs.humidity})/100`);
  console.log('    Precipitation:', precip, `(5-${inputs.precipitation})/5`);
  console.log('    Snowfall:', snow, `(5-${inputs.snowfall})/5`);
  console.log('    Cloud cover:', cloud, `(100-${inputs.cloudcover})/100`);
  console.log('');

  const factors = [vis, hum, precip, snow, cloud].filter((v): v is number => v !== null);

  if (isFarpoint) {
    // Farpoint: 能见度权重80%，其他20%
    const visWeight = 0.8;
    const otherWeight = 0.2;
    const otherFactors = factors.filter((_, i) => i !== 0);
    const otherAvg = otherFactors.length ? otherFactors.reduce((a, b) => a + b, 0) / otherFactors.length : 0.5;
    const score = (vis ?? 0.5) * visWeight + otherAvg * otherWeight;
    console.log('  Farpoint weighting:');
    console.log('    Visibility weight: 80%');
    console.log('    Other average:', otherAvg);
    console.log('    Score = (', vis, '× 0.8) + (', otherAvg, '× 0.2) =', score);
    return score;
  } else {
    // 普通：所有因素等权重
    const avg = factors.reduce((a, b) => a + b, 0) / factors.length;
    console.log('  Equal weighting:');
    console.log('    Average of all factors =', avg);
    return avg;
  }
}

const qualityScore = buildQualityScore({
  visibility: testCase.visibility,
  humidity: testCase.humidity,
  precipitation: testCase.precipitation,
  snowfall: testCase.snowfall,
  cloudcover: testCase.cloudcover,
}, testCase.isFarpoint);

console.log('  Final qualityScore =', qualityScore);
console.log('');

// Step 4: 质量分数调整
console.log('Step 4: Adjusted Quality');
console.log('-'.repeat(60));

const adjustedQuality = 0.3 + 0.7 * qualityScore;
console.log('  adjustedQuality = 0.3 + (0.7 ×', qualityScore, ')');
console.log('  adjustedQuality =', adjustedQuality);
console.log('');

// Step 5: 特殊惩罚因子
console.log('Step 5: Special Penalties');
console.log('-'.repeat(60));

let specialPenalty = 1.0;
console.log('  Initial penalty:', specialPenalty);

// 睡眠时间惩罚
const isSleepTime = testCase.localHour >= 22 || testCase.localHour < 6;
if (testCase.noSleepTime && isSleepTime) {
  specialPenalty *= 0.05;
  console.log('  ❌ Sleep time penalty: ×0.05');
} else {
  console.log('  ✅ No sleep time penalty (noSleepTime =', testCase.noSleepTime, ', hour =', testCase.localHour, ')');
}

// dayOnly惩罚
if (!testCase.isDaytime) {
  // 假设这不是dayOnly camera
  console.log('  ✅ No dayOnly penalty (not dayOnly camera)');
} else {
  console.log('  ✅ No dayOnly penalty (isDaytime = true)');
}

console.log('  Final specialPenalty =', specialPenalty);
console.log('');

// Step 6: 最终分数
console.log('Step 6: Final Score');
console.log('-'.repeat(60));

const rawScore = baseScore * weatherWeight * adjustedQuality * specialPenalty;
const finalScore = Math.round(Math.max(0, Math.min(100, rawScore)));

console.log('  Formula: baseScore × weatherWeight × adjustedQuality × specialPenalty');
console.log('  Calculation:', baseScore, '×', weatherWeight, '×', adjustedQuality, '×', specialPenalty);
console.log('  Raw score =', rawScore);
console.log('  Final score (rounded, clamped) =', finalScore);
console.log('');

console.log('='.repeat(60));
console.log('\n📈 Result Summary:\n');
console.log('  Expected: 60-70');
console.log('  Actual:', finalScore);
console.log('  Status:', finalScore >= 60 && finalScore <= 70 ? '✅ Pass' : '❌ Fail');
console.log('');

if (finalScore < 60) {
  console.log('💡 Why is the score low?\n');

  // 分析每个因素的影响
  const impact = {
    base: baseScore,
    afterWeather: baseScore * weatherWeight,
    afterQuality: baseScore * weatherWeight * adjustedQuality,
    final: finalScore,
  };

  console.log('  Score progression:');
  console.log('    Start:', impact.base);
  console.log('    After weather weight:', impact.afterWeather, `(${weatherWeight === 1 ? 'no change' : '-' + ((1 - weatherWeight) * 100).toFixed(0) + '%'})`);
  console.log('    After quality:', impact.afterQuality.toFixed(1), `(-${((1 - adjustedQuality) * 100).toFixed(0)}%)`);
  console.log('    After penalties:', impact.final, `(${specialPenalty === 1 ? 'no change' : '-' + ((1 - specialPenalty) * 100).toFixed(0) + '%'})`);
  console.log('');

  // 最大的减分项
  const weatherLoss = baseScore - impact.afterWeather;
  const qualityLoss = impact.afterWeather - impact.afterQuality;
  const penaltyLoss = impact.afterQuality - impact.final;

  console.log('  Loss breakdown:');
  console.log('    Weather:', weatherLoss.toFixed(1), 'points');
  console.log('    Quality:', qualityLoss.toFixed(1), 'points');
  console.log('    Penalties:', penaltyLoss.toFixed(1), 'points');
  console.log('');

  const maxLoss = Math.max(weatherLoss, qualityLoss, penaltyLoss);
  if (maxLoss === qualityLoss) {
    console.log('  → Largest loss: Quality factor');
    console.log('    adjustedQuality =', adjustedQuality);
    console.log('    This reduces score by', ((1 - adjustedQuality) * 100).toFixed(0), '%');
    console.log('');
    console.log('    Possible solutions:');
    console.log('      1. Reduce quality impact: change formula from 0.3+0.7×q to 0.5+0.5×q');
    console.log('      2. Increase base score from 70 to higher value');
    console.log('      3. Add special boost for t0/t1 city-skyline at night');
  } else if (maxLoss === weatherLoss) {
    console.log('  → Largest loss: Weather weight');
  } else {
    console.log('  → Largest loss: Penalty factors');
  }
}
console.log('');
