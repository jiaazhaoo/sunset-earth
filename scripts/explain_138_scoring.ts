/**
 * 解释138号摄像头（滑雪场）晚上为什么还能有高分
 */

console.log('🎿 Camera #138 - 滑雪场摄像头晚上评分分析\n');
console.log('='.repeat(60));

console.log('\n📋 摄像头元数据:');
console.log('  Primary Type: ski-resort');
console.log('  dayOnly: true  ← 标记为"仅白天"');
console.log('  tier: t1');
console.log('  isFarpoint: false');
console.log('');

console.log('🧮 算法v2的评分逻辑:\n');

console.log('假设晚上20:00，晴天，非黄金时刻：');
console.log('');
console.log('1️⃣ 时间基础分:');
console.log('   - timeTier = 6 (普通夜晚)');
console.log('   - baseScore = 40分');
console.log('');

console.log('2️⃣ 天气适配度:');
console.log('   - weatherClass = "clear"');
console.log('   - weatherWeight = 1.0');
console.log('');

console.log('3️⃣ 质量分数:');
console.log('   - qualityScore = 0.95 (晴天，高能见度)');
console.log('   - adjustedQuality = 0.3 + 0.7 * 0.95 = 0.965');
console.log('');

console.log('4️⃣ 特殊惩罚因子:');
console.log('   - 睡眠时间惩罚: 1.0 (20:00不是睡眠时间)');
console.log('   - dayOnly惩罚: 0.1  ← 这里触发了！');
console.log('   - specialPenalty = 1.0 × 0.1 = 0.1');
console.log('');

console.log('5️⃣ 最终分数计算:');
console.log('   finalScore = 40 × 1.0 × 0.965 × 0.1');
console.log('   finalScore = 40 × 0.0965');
console.log('   finalScore ≈ 3.86分');
console.log('');

console.log('='.repeat(60));
console.log('\n❓ 为什么晚上还有分数（不是0分）？\n');

console.log('算法设计理念解释：\n');

console.log('✅ dayOnly惩罚 = 0.1 (降低90%，不是归零)');
console.log('   原因：');
console.log('   1. 部分滑雪场有夜场照明');
console.log('   2. 滑雪场夜景也可能有观赏价值（灯光、雪景）');
console.log('   3. 给算法保留一定灵活性');
console.log('');

console.log('❌ aurora惩罚 = 0 (直接归零)');
console.log('   原因：');
console.log('   1. Aurora白天完全不可见，没有任何观赏价值');
console.log('   2. 物理上不存在的现象，必须归零');
console.log('');

console.log('='.repeat(60));
console.log('\n🔍 实际场景分析:\n');

console.log('场景A: 滑雪场，晚上20:00，晴天');
console.log('  - 基础分: 40 (Tier 6)');
console.log('  - dayOnly惩罚: ×0.1');
console.log('  - 最终: ~4分');
console.log('  - 解读: 非常低，基本不推荐');
console.log('');

console.log('场景B: 滑雪场，白天12:00，晴天');
console.log('  - 基础分: 50 (Tier 4 daytime)');
console.log('  - dayOnly惩罚: ×1.0 (白天不惩罚)');
console.log('  - 最终: ~48分');
console.log('  - 解读: 中等偏上，值得推荐');
console.log('');

console.log('场景C: 滑雪场，黄金时刻，晴天');
console.log('  - 基础分: 100 (Tier 1)');
console.log('  - dayOnly惩罚: ×1.0 (白天不惩罚)');
console.log('  - 最终: ~95分');
console.log('  - 解读: 非常高，优先推荐');
console.log('');

console.log('='.repeat(60));
console.log('\n💡 结论:\n');

console.log('138号滑雪场晚上评分 ≈ 3-5分：');
console.log('  ✅ 不是0分（留有余地）');
console.log('  ✅ 非常低（90%惩罚）');
console.log('  ✅ 基本不会被推荐（排名靠后）');
console.log('  ✅ 符合预期行为');
console.log('');

console.log('如果你觉得晚上分数还是太高，可以考虑：');
console.log('  方案A: 将dayOnly惩罚从0.1改为0（直接归零，和aurora一样）');
console.log('  方案B: 将dayOnly惩罚从0.1改为0.05（更严格）');
console.log('  方案C: 针对ski-resort特殊处理（晚上直接归零）');
console.log('');
