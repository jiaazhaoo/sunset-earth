# 算法v2迁移指南

## 📋 概述

本指南介绍如何将新的推荐算法v2集成到现有系统中。

---

## 🚀 执行步骤

### Step 1: 数据库迁移 🔥 必须先完成

在Supabase SQL Editor中按顺序执行：

**1.1 添加字段和索引**
```bash
# 打开文件
open scripts/migrations/001_add_camera_metadata.sql

# 复制全部内容到Supabase SQL Editor执行
```

**1.2 更新所有摄像头元数据**
```bash
# 打开文件
open scripts/migrations/002_update_all_camera_metadata.sql

# 复制全部内容到Supabase SQL Editor执行
```

**1.3 验证**
```sql
-- 应该返回156
SELECT COUNT(*) FROM camera_ytb WHERE camera_metadata IS NOT NULL;
```

---

### Step 2: 代码集成

新算法文件已创建，现在需要在现有代码中使用它们。

#### 方案A: 渐进式迁移（推荐）

**阶段1**: 保留旧算法，新增v2算法选项

在你需要评分的地方（如 `app/api/compute-rankings/route.ts`）：

```typescript
import { scoreCameraWeather } from '@/lib/client-ranking';  // 旧算法
import { scoreCameraWeather as scoreCameraWeatherV2 } from '@/lib/client-ranking-v2';  // 新算法
import { parseCameraMetadata } from '@/lib/camera-metadata-types';

// 在评分函数中
const useV2 = true;  // 或从环境变量读取

if (useV2) {
  // 使用新算法
  const metadata = parseCameraMetadata(camera.camera_metadata);
  const evaluation = scoreCameraWeatherV2(weather, now, {
    cameraMetadata: metadata,
    sunsetDelayMinutes: camera.sunset_delay,
    sunriseAdvanceMinutes: camera.sunrise_advance,
    timezone: camera.timezone,
  });
} else {
  // 使用旧算法
  const evaluation = scoreCameraWeather(weather, now, {
    hasCitySkyline: camera.tags?.includes('City Skyline'),
    sunsetDelayMinutes: camera.sunset_delay,
    sunriseAdvanceMinutes: camera.sunrise_advance,
  });
}
```

**阶段2**: A/B测试对比

```typescript
// 同时计算两个算法
const evalV1 = scoreCameraWeather(weather, now, optionsV1);
const evalV2 = scoreCameraWeatherV2(weather, now, optionsV2);

// 记录对比数据
console.log('Score comparison:', {
  camera_id: camera.camera_id,
  v1_score: evalV1.score,
  v2_score: evalV2.score,
  diff: evalV2.score - evalV1.score,
});

// 根据用户分组返回不同结果
const useV2 = userId % 2 === 0;  // 50%用户使用v2
return useV2 ? evalV2 : evalV1;
```

**阶段3**: 完全迁移

当v2验证通过后，直接替换：

```typescript
// 全部替换为v2
import { scoreCameraWeather } from '@/lib/client-ranking-v2';
import { parseCameraMetadata } from '@/lib/camera-metadata-types';
```

#### 方案B: 立即替换（快速但风险高）

```bash
# 备份旧文件
cp lib/client-ranking.ts lib/client-ranking-v1-backup.ts

# 替换导入
# 在所有使用 scoreCameraWeather 的文件中：
# - 添加 parseCameraMetadata 导入
# - 传入 cameraMetadata 参数
```

---

### Step 3: 更新API路由

#### 更新 `app/api/compute-rankings/route.ts`

```typescript
import { scoreCameraWeather } from '@/lib/client-ranking-v2';
import { parseCameraMetadata } from '@/lib/camera-metadata-types';

// 在计算排名的循环中
for (const camera of cameras) {
  const weather = weatherMap.get(camera.camera_id);
  if (!weather) continue;

  // 解析元数据
  const metadata = parseCameraMetadata(camera.camera_metadata);

  // 计算评分
  const evaluation = scoreCameraWeather(weather, now, {
    cameraMetadata: metadata,
    sunsetDelayMinutes: camera.sunset_delay ?? 0,
    sunriseAdvanceMinutes: camera.sunrise_advance ?? 0,
    timezone: camera.timezone,
  });

  // 保存排名...
}
```

#### 更新 `app/api/best-camera/route.ts`

如果你在客户端也需要评分：

```typescript
import { scoreCameraWeather } from '@/lib/client-ranking-v2';
import { parseCameraMetadata } from '@/lib/camera-metadata-types';

// 客户端排名
const camerasWithScores = cameras.map(camera => {
  const metadata = parseCameraMetadata(camera.camera_metadata);
  const evaluation = scoreCameraWeather(weather, now, {
    cameraMetadata: metadata,
    sunsetDelayMinutes: camera.sunset_delay,
    sunriseAdvanceMinutes: camera.sunrise_advance,
    timezone: camera.timezone,
  });

  return { camera, evaluation };
});
```

---

### Step 4: 环境变量配置（可选）

在 `.env.local` 中添加：

```bash
# 算法版本控制
NEXT_PUBLIC_RANKING_ALGORITHM_VERSION=v2

# A/B测试比例（0-100）
NEXT_PUBLIC_V2_ROLLOUT_PERCENTAGE=50
```

在代码中使用：

```typescript
const useV2 = process.env.NEXT_PUBLIC_RANKING_ALGORITHM_VERSION === 'v2';
const rolloutPercentage = parseInt(process.env.NEXT_PUBLIC_V2_ROLLOUT_PERCENTAGE || '100');
const useV2ForThisUser = (userId % 100) < rolloutPercentage;
```

---

## 🧪 如何验证算法已生效并运行无误

### 方法1: 快速验证脚本（推荐）

运行自动化验证脚本，一键检查所有关键功能：

```bash
# 快速验证（30秒）
npx tsx scripts/quick_verify_v2.ts

# 完整测试套件（1-2分钟）
npx tsx scripts/test_algorithm_v2.ts
```

**快速验证脚本会检查**:
- ✅ 数据库迁移是否成功（156个摄像头元数据）
- ✅ 算法v2能否正常运行
- ✅ Aurora摄像头白天返回0分
- ✅ 元数据解析正确

**完整测试套件会检查**:
- ✅ 所有数据库迁移
- ✅ 算法核心功能
- ✅ 6大关键修复（白天定义、Farpoint权重、睡眠时间等）
- ✅ 天气分类细分
- ✅ 多种边界情况

### 方法2: 手动验证

#### 2.1 验证数据库迁移

在Supabase SQL Editor执行：

```sql
-- 1. 检查元数据数量（应该是156）
SELECT COUNT(*) as total_cameras
FROM camera_ytb
WHERE camera_metadata IS NOT NULL;

-- 2. 检查关键摄像头元数据
SELECT
  camera_id,
  camera_name,
  camera_metadata->>'primaryType' as type,
  camera_metadata->>'isFarpoint' as farpoint,
  camera_metadata->>'tier' as tier
FROM camera_ytb
WHERE camera_id IN (1, 7, 11, 2)  -- Aurora, Street, City Skyline, Farpoint Mountain
ORDER BY camera_id;

-- 3. 检查各类型分布
SELECT
  camera_metadata->>'primaryType' as camera_type,
  COUNT(*) as count
FROM camera_ytb
WHERE camera_metadata IS NOT NULL
GROUP BY camera_metadata->>'primaryType'
ORDER BY count DESC;

-- 4. 检查Farpoint分布（应该是38个true, 118个false）
SELECT
  camera_metadata->>'isFarpoint' as is_farpoint,
  COUNT(*) as count
FROM camera_ytb
WHERE camera_metadata IS NOT NULL
GROUP BY camera_metadata->>'isFarpoint';
```

**预期结果**:
```
total_cameras: 156
camera_id=1: type=aurora, farpoint=false, tier=t2
camera_id=7: type=street, farpoint=false, tier=t2
camera_id=11: type=city-skyline, farpoint=true, tier=t2
camera_id=2: type=mountain, farpoint=true, tier=t2

farpoint分布:
  true: 38
  false: 118
```

#### 2.2 验证算法代码集成

在你的API路由中添加调试日志：

```typescript
import { scoreCameraWeather } from '@/lib/client-ranking-v2';
import { parseCameraMetadata } from '@/lib/camera-metadata-types';

// 在评分循环中
const metadata = parseCameraMetadata(camera.camera_metadata);
console.log('📊 Camera metadata:', {
  camera_id: camera.camera_id,
  primaryType: metadata?.primaryType,
  isFarpoint: metadata?.isFarpoint,
});

const evaluation = scoreCameraWeather(weather, now, {
  cameraMetadata: metadata,
  sunsetDelayMinutes: camera.sunset_delay ?? 0,
  sunriseAdvanceMinutes: camera.sunrise_advance ?? 0,
  timezone: camera.timezone,
});

console.log('📊 Scoring result:', {
  camera_id: camera.camera_id,
  score: evaluation.score,
  weatherClass: evaluation.weatherClass,
  isDaytime: evaluation.isDaytime,
  label: evaluation.label,
});
```

运行你的API：
```bash
# 触发评分计算
curl http://localhost:3000/api/compute-rankings

# 检查日志输出
# 应该看到类似这样的输出：
# 📊 Camera metadata: { camera_id: 1, primaryType: 'aurora', isFarpoint: false }
# 📊 Scoring result: { camera_id: 1, score: 0, weatherClass: 'clear', isDaytime: true, ... }
```

#### 2.3 验证关键修复

**测试Case 1: Aurora白天应该返回0分**

```typescript
// Camera #1 - Aurora
const camera1 = await supabase
  .from('camera_ytb')
  .select('*')
  .eq('camera_id', 1)
  .single();

const metadata = parseCameraMetadata(camera1.data.camera_metadata);
// 预期: { primaryType: 'aurora', nightOnly: true }

// 白天评分
const daytimeWeather = {
  // ... 白天天气数据，current_weather.is_day = 1
};
const evalDaytime = scoreCameraWeather(daytimeWeather, new Date(), {
  cameraMetadata: metadata,
});

console.assert(evalDaytime.score === 0, 'Aurora should score 0 in daytime');
// ✅ 如果不报错，说明修复生效
```

**测试Case 2: Farpoint摄像头能见度权重应该很高**

```typescript
// Camera #2 - Farpoint Mountain
const camera2 = await supabase
  .from('camera_ytb')
  .select('*')
  .eq('camera_id', 2)
  .single();

const metadata = parseCameraMetadata(camera2.data.camera_metadata);
// 预期: { primaryType: 'mountain', isFarpoint: true }

// 高能见度天气
const highVisWeather = {
  // ... visibility: [20000]
};
const evalHighVis = scoreCameraWeather(highVisWeather, now, {
  cameraMetadata: metadata,
});

// 低能见度天气
const lowVisWeather = {
  // ... visibility: [3000]
};
const evalLowVis = scoreCameraWeather(lowVisWeather, now, {
  cameraMetadata: metadata,
});

const diff = evalHighVis.score - evalLowVis.score;
console.assert(diff > 15, `Farpoint should heavily weight visibility, diff=${diff}`);
// ✅ 差值应该>15分
```

**测试Case 3: 睡眠时间街景摄像头应该<5分**

```typescript
// Camera #7 - Times Square Street
const camera7 = await supabase
  .from('camera_ytb')
  .select('*')
  .eq('camera_id', 7)
  .single();

const metadata = parseCameraMetadata(camera7.data.camera_metadata);
// 预期: { primaryType: 'street', noSleepTime: true }

// 睡眠时间（23:00 local time）
const sleepTime = new Date();
sleepTime.setHours(23, 0, 0, 0);

const evalSleepTime = scoreCameraWeather(weather, sleepTime, {
  cameraMetadata: metadata,
  timezone: 'America/New_York',
});

console.assert(evalSleepTime.score < 5, `Street camera should score <5 at sleep time, got ${evalSleepTime.score}`);
// ✅ 应该<5分
```

### 方法3: 生产环境监控

部署后，在生产环境添加监控：

```typescript
// app/api/compute-rankings/route.ts

const results = cameras.map(camera => {
  const metadata = parseCameraMetadata(camera.camera_metadata);
  const evaluation = scoreCameraWeather(weather, now, {
    cameraMetadata: metadata,
    // ...
  });

  // 记录关键指标
  if (process.env.NODE_ENV === 'production') {
    analytics.track('camera_scoring_v2', {
      camera_id: camera.camera_id,
      camera_type: metadata?.primaryType,
      is_farpoint: metadata?.isFarpoint,
      score: evaluation.score,
      weather_class: evaluation.weatherClass,
      is_daytime: evaluation.isDaytime,
      algorithm_version: 'v2',
    });
  }

  return { camera, evaluation };
});

// 检查异常情况
const zeroScores = results.filter(r => r.evaluation.score === 0).length;
const highScores = results.filter(r => r.evaluation.score > 80).length;

console.log('📊 Scoring summary:', {
  total: results.length,
  zero_scores: zeroScores,
  high_scores: highScores,
  avg_score: results.reduce((sum, r) => sum + r.evaluation.score, 0) / results.length,
});

// ⚠️ 告警阈值
if (zeroScores > results.length * 0.7) {
  console.warn('⚠️ Too many zero scores, check algorithm');
}
```

---

## ✅ 验证清单

### 数据库验证
- [ ] `camera_metadata` 字段已添加
- [ ] 156个摄像头元数据已更新
- [ ] 索引已创建
- [ ] 查询 `SELECT camera_id, camera_metadata->>'primaryType' FROM camera_ytb LIMIT 5` 返回正确数据

### 代码验证
- [ ] 导入新算法模块成功
- [ ] `parseCameraMetadata` 能正确解析元数据
- [ ] `scoreCameraWeather` 返回合理分数（0-100）
- [ ] 天气细分逻辑工作正常

### 功能验证

**测试Case 1: Aurora极光（Camera #1）**
```typescript
// 预期：白天返回0分
const evalDaytime = scoreCameraWeather(weatherData, daytimeNow, {
  cameraMetadata: { primaryType: 'aurora', nightOnly: true, ... },
  timezone: 'America/Godthab',
});
console.assert(evalDaytime.score === 0, 'Aurora should score 0 in daytime');

// 预期：晴朗夜晚返回55-65分
const evalNight = scoreCameraWeather(clearWeather, nightNow, {
  cameraMetadata: { primaryType: 'aurora', nightOnly: true, ... },
  timezone: 'America/Godthab',
});
console.assert(evalNight.score >= 55 && evalNight.score <= 65, 'Aurora score should be 55-65 at clear night');
```

**测试Case 2: Times Square街景（Camera #7）**
```typescript
// 预期：睡眠时间（23:00）返回<5分
const evalSleepTime = scoreCameraWeather(weatherData, sleepTimeNow, {
  cameraMetadata: { primaryType: 'street', noSleepTime: true, ... },
  timezone: 'America/New_York',
});
console.assert(evalSleepTime.score < 5, 'Street camera should score <5 during sleep time');
```

**测试Case 3: Farpoint山景（Camera #2）**
```typescript
// 预期：高能见度得分明显高于低能见度
const evalHighVis = scoreCameraWeather(
  { ...weather, hourly: { ...weather.hourly, visibility: [18000] } },
  now,
  { cameraMetadata: { primaryType: 'mountain', isFarpoint: true, ... } }
);

const evalLowVis = scoreCameraWeather(
  { ...weather, hourly: { ...weather.hourly, visibility: [5000] } },
  now,
  { cameraMetadata: { primaryType: 'mountain', isFarpoint: true, ... } }
);

console.assert(evalHighVis.score > evalLowVis.score + 15, 'Farpoint should heavily weight visibility');
```

---

## 🔄 回滚方案

如果v2出现问题，快速回滚：

### 方案1: 代码回滚

```typescript
// 改回v1导入
import { scoreCameraWeather } from '@/lib/client-ranking';  // 或 ./client-ranking-v1-backup

// 移除元数据解析
// const metadata = parseCameraMetadata(camera.camera_metadata);  // 注释掉

// 恢复旧参数
const evaluation = scoreCameraWeather(weather, now, {
  hasCitySkyline: camera.tags?.includes('City Skyline'),
  sunsetDelayMinutes: camera.sunset_delay,
  sunriseAdvanceMinutes: camera.sunrise_advance,
});
```

### 方案2: 环境变量回滚

```bash
# .env.local
NEXT_PUBLIC_RANKING_ALGORITHM_VERSION=v1
```

### 方案3: 数据库保留

数据库的`camera_metadata`字段不会影响v1算法，可以保留。

---

## 📊 性能监控

### 关键指标

监控以下指标确保v2算法运行正常：

```typescript
// 记录评分时间
const start = performance.now();
const evaluation = scoreCameraWeather(weather, now, options);
const duration = performance.now() - start;

// 记录指标
metrics.record({
  operation: 'camera_scoring',
  algorithm_version: 'v2',
  duration_ms: duration,
  score: evaluation.score,
  camera_type: metadata.primaryType,
  is_farpoint: metadata.isFarpoint,
});
```

**预期性能**:
- 单个摄像头评分：<5ms
- 156个摄像头批量评分：<500ms

**告警阈值**:
- 如果评分时间>50ms，需要优化
- 如果0分摄像头占比>50%，检查逻辑

---

## 🐛 常见问题

### Q1: 某些摄像头分数为0

**原因**: 可能是元数据配置过于严格（如nightOnly摄像头在白天）

**解决**: 检查元数据是否符合预期：
```sql
SELECT camera_id, camera_metadata
FROM camera_ytb
WHERE camera_id IN (1, 7, 11);  -- 检查问题摄像头
```

### Q2: Farpoint摄像头分数异常

**原因**: 能见度数据缺失

**解决**: 检查天气数据：
```typescript
console.log('Visibility data:', weather.hourly?.visibility);
// 如果为undefined，buildQualityScoreEnhanced会使用默认值0.5
```

### Q3: 睡眠时间惩罚未生效

**原因**: timezone字段为空

**解决**: 确保传入timezone参数：
```typescript
const evaluation = scoreCameraWeather(weather, now, {
  cameraMetadata: metadata,
  timezone: camera.timezone || weather.timezone,  // 回退到天气API的timezone
});
```

---

## 📝 后续优化

完成迁移后的优化方向：

1. **数据收集**: 开始记录用户点击/跳过行为
2. **A/B测试**: 对比v1和v2的用户满意度
3. **参数调优**: 根据数据微调权重系数
4. **ML集成**: 收集足够数据后训练个性化模型

---

## 📞 需要帮助？

遇到问题请检查：
1. [算法重构文档](./ALGORITHM_REFACTOR_2025.md)
2. [迁移README](../scripts/migrations/README.md)
3. 新算法代码注释（`lib/client-ranking-v2.ts`）

---

## 变更历史

- 2025-12-18: 初始版本
