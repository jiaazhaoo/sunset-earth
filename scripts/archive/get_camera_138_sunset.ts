/**
 * 获取138号摄像头的实际日落时间
 */

// 模拟一些常见滑雪场的位置来推测
const commonSkiResorts = [
  { name: 'Whistler, BC', lat: 50.1163, lon: -122.9574, timezone: 'America/Vancouver' },
  { name: 'Aspen, CO', lat: 39.1911, lon: -106.8175, timezone: 'America/Denver' },
  { name: 'Lake Tahoe, CA', lat: 39.0968, lon: -120.0324, timezone: 'America/Los_Angeles' },
  { name: 'Park City, UT', lat: 40.6461, lon: -111.4980, timezone: 'America/Denver' },
  { name: 'Banff, AB', lat: 51.1784, lon: -115.5708, timezone: 'America/Edmonton' },
  { name: 'Alps (Europe)', lat: 46.0, lon: 8.0, timezone: 'Europe/Zurich' },
];

console.log('🎿 Camera #138 Sunset Time Analysis\n');
console.log('='.repeat(60));
console.log('\n由于无法直接访问数据库，我们分析几种可能的情况：\n');

// 获取当前日期的日落时间
const today = new Date();
const winterDate = new Date(2024, 11, 19); // 2024年12月19日（冬季）
const summerDate = new Date(2024, 5, 19);  // 2024年6月19日（夏季）

console.log('📅 测试日期:');
console.log(`  冬季: ${winterDate.toLocaleDateString()}`);
console.log(`  夏季: ${summerDate.toLocaleDateString()}`);
console.log('');

// 简化的日落时间计算（基于纬度的粗略估算）
function estimateSunset(lat: number, date: Date): string {
  // 冬季（12月）
  if (date.getMonth() === 11) {
    if (lat > 50) return '15:30-16:30'; // 高纬度，日落很早
    if (lat > 45) return '16:00-17:00';
    if (lat > 40) return '16:30-17:30';
    return '17:00-18:00';
  }
  // 夏季（6月）
  if (date.getMonth() === 5) {
    if (lat > 50) return '21:00-22:00'; // 高纬度，日落很晚
    if (lat > 45) return '20:30-21:30';
    if (lat > 40) return '20:00-21:00';
    return '19:30-20:30';
  }
  // 春秋
  return '18:00-19:00';
}

console.log('🌍 可能的滑雪场位置及日落时间:\n');

for (const resort of commonSkiResorts) {
  console.log(`${resort.name} (${resort.lat.toFixed(2)}°N, ${resort.lon.toFixed(2)}°)`);
  console.log(`  时区: ${resort.timezone}`);
  console.log(`  冬季日落: ${estimateSunset(resort.lat, winterDate)}`);
  console.log(`  夏季日落: ${estimateSunset(resort.lat, summerDate)}`);

  // 计算扩展白天的结束时间
  const winterSunsetEnd = resort.lat > 45 ? '16:45' : '17:45';
  const summerSunsetEnd = resort.lat > 45 ? '21:15' : '20:45';

  console.log(`  扩展白天结束 (日落+45分):`);
  console.log(`    冬季: ~${winterSunsetEnd}`);
  console.log(`    夏季: ~${summerSunsetEnd}`);
  console.log('');
}

console.log('='.repeat(60));
console.log('\n🔍 关键发现:\n');

console.log('1️⃣ 夏季问题（6-8月）:');
console.log('   - 高纬度滑雪场日落可能在20:30-21:30');
console.log('   - 扩展白天结束时间: 21:15-22:15');
console.log('   - 晚上20:00可能仍算"白天" ✅ 这是62分的原因！');
console.log('');

console.log('2️⃣ 冬季情况（12-2月）:');
console.log('   - 日落早（16:00-17:30）');
console.log('   - 扩展白天结束: 16:45-18:15');
console.log('   - 晚上20:00肯定是夜晚，分数会很低');
console.log('');

console.log('3️⃣ 实际测试建议:');
console.log('   - 检查138号摄像头的真实经纬度');
console.log('   - 检查你看到62分时的具体时间和季节');
console.log('   - 如果是夏季高纬度，62分是正常的（算法认为仍是白天）');
console.log('');

console.log('='.repeat(60));
console.log('\n💡 解决方案确认:\n');

console.log('如果问题出现在夏季/高纬度场景：');
console.log('  → 方案C最合适：dayOnly摄像头使用严格白天定义');
console.log('  → 即：dayOnly摄像头的白天 = 日出到日落（不扩展45分钟）');
console.log('  → 这样晚上8点肯定算夜晚，分数会降到2-5分');
console.log('');

console.log('需要你确认：');
console.log('  ❓ 你看到62分是在什么时间？（当地时间）');
console.log('  ❓ 是在夏季还是冬季？');
console.log('  ❓ 138号摄像头的位置是哪里？');
console.log('');
