/**
 * 调试为什么晚上10点被认为是"扩展日落"
 */

console.log('🐛 Debugging Sunset Extended Bug\n');
console.log('='.repeat(60));

const nightTime = new Date();
nightTime.setHours(22, 0, 0, 0); // 晚上10点
console.log('Current time: 22:00');
console.log('Timestamp:', nightTime.toISOString());
console.log('');

// 日落在4小时前 = 18:00
const sunset = new Date(nightTime.getTime() - 4 * 3600000);
console.log('Sunset time: 18:00 (4 hours ago)');
console.log('Timestamp:', sunset.toISOString());
console.log('');

// 扩展日落窗口
const extendedAfterStart = new Date(sunset.getTime() + 30 * 60000); // 日落后30分钟
const extendedAfterEnd = new Date(sunset.getTime() + 60 * 60000);   // 日落后60分钟

console.log('Extended sunset window (after):');
console.log('  Start:', extendedAfterStart.toISOString(), '(18:30)');
console.log('  End:', extendedAfterEnd.toISOString(), '(19:00)');
console.log('');

console.log('扩展白天定义:');
const extendedDayEnd = new Date(sunset.getTime() + 45 * 60000); // 日落后45分钟
console.log('  End:', extendedDayEnd.toISOString(), '(18:45)');
console.log('');

console.log('判断:');
console.log('  22:00 in extended-sunset window (18:30-19:00)?', nightTime >= extendedAfterStart && nightTime <= extendedAfterEnd);
console.log('  22:00 in extended daytime (until 18:45)?', nightTime <= extendedDayEnd);
console.log('');

console.log('='.repeat(60));
console.log('\n问题分析:\n');

console.log('22:00不应该在任何扩展窗口内，但算法返回了sunset-extended');
console.log('');
console.log('可能的原因:');
console.log('  1. 日落时间解析错误（时区问题）');
console.log('  2. buildWindows函数创建了错误的窗口');
console.log('  3. findMatchingWindow的逻辑有bug');
console.log('');

console.log('让我们检查实际传入的日落字符串:');
const sunsetString = new Date(nightTime.getTime() - 4 * 3600000).toISOString().split('.')[0];
console.log('  Daily sunset string:', sunsetString);
console.log('  (无时区后缀，应该被解释为本地时间)');
console.log('');

console.log('如果parseDateInTimezone工作正确:');
console.log('  "' + sunsetString + '" + timezone="America/New_York"');
console.log('  应该解析为: 18:00 EST = ' + new Date(nightTime.getTime() - 4 * 3600000).toISOString());
console.log('');

console.log('但如果parseDateInTimezone有bug:');
console.log('  可能解析为: 18:00 UTC');
console.log('  在EST时区就变成: 13:00 EST (错误!)');
console.log('  那么22:00就可能在"扩展窗口"内');
console.log('');
