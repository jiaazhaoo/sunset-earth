# 算法v2测试和验证指南

## 📋 概述

本目录包含验证算法v2是否正确部署和运行的测试脚本。

---

## 🚀 快速开始

### 1. 执行数据库迁移后，立即运行快速验证

```bash
npx tsx scripts/quick_verify_v2.ts
```

**这个脚本会检查**:
- ✅ 数据库迁移是否成功（156个摄像头）
- ✅ 关键摄像头的元数据解析
- ✅ Aurora白天返回0分（关键修复验证）

**预期输出**:
```
🔍 Quick Verification of Algorithm v2

1️⃣ Checking database migration...
✅ Database OK: 156/156 cameras have metadata

2️⃣ Testing key cameras...
✅ Camera #1 (aurora): Score=0.00, Weather=clear
✅ Camera #7 (street): Score=65.23, Weather=clear
✅ Camera #11 (city-skyline): Score=72.45, Weather=clear

3️⃣ Testing critical fixes...
✅ Aurora daytime penalty: Score is 0 during daytime

✅ All checks passed! Algorithm v2 is working correctly.
```

### 2. 运行完整测试套件

```bash
npx tsx scripts/test_algorithm_v2.ts
```

**完整测试包括**:
- 📊 数据库迁移验证
- 🧮 算法核心功能测试
- 🔧 6大关键修复验证
  - 白天定义扩展（sunrise-45min to sunset+45min）
  - Farpoint能见度权重（70%）
  - Aurora白天惩罚（0分）
  - 睡眠时间惩罚（0.05系数）
  - 蓝调时刻天气宽容（0.98系数）
  - 天气细分（light-rain vs heavy-rain）
- 🌦️ 天气分类测试

**预期输出**:
```
🚀 Algorithm v2 Validation Test Suite
============================================================

📊 Test 1: Database Migration
============================================================
✅ Database Migration: All 156 cameras have metadata
✅ Metadata Structure (Camera #1): Valid metadata: aurora, farpoint=false
✅ Metadata Structure (Camera #7): Valid metadata: street, farpoint=false
...

🧮 Test 2: Algorithm Core Functionality
============================================================
✅ Basic Scoring: Score in valid range: 65.23
✅ Metadata-Driven Scoring: City skyline scored 72.45
...

🔧 Test 3: Critical Fixes Validation
============================================================
✅ Extended Daytime Definition: Daytime extends 45min before sunrise and after sunset
✅ Farpoint Visibility Weighting: High visibility scored 23.45 points higher
✅ Aurora Daytime Penalty: Aurora correctly scored 0 during daytime
✅ Sleep Time Penalty: Street camera scored 3.21 during sleep time (<10)
...

📋 Test Summary
============================================================
Total Tests: 15
✅ Passed: 15
❌ Failed: 0
Success Rate: 100.0%

✅ All tests passed! Algorithm v2 is working correctly.
```

---

## 🧪 测试脚本说明

### `quick_verify_v2.ts` - 快速验证

**用途**: 部署后快速检查算法是否生效
**运行时间**: ~30秒
**适用场景**: 数据库迁移后、代码部署后

**检查项**:
1. 数据库元数据数量（156个）
2. 3个关键摄像头的评分（Aurora, Street, City Skyline）
3. Aurora白天0分验证

### `test_algorithm_v2.ts` - 完整测试套件

**用途**: 全面验证算法的所有功能和修复
**运行时间**: ~1-2分钟
**适用场景**: 重大更新前、上线前验证

**测试分类**:
- **Test 1**: 数据库迁移验证
- **Test 2**: 算法核心功能
- **Test 3**: 6大关键修复
- **Test 4**: 天气分类细分

---

## 📝 手动验证步骤

如果你不想运行自动化脚本，可以手动验证：

### Step 1: 验证数据库

在Supabase SQL Editor执行：

```sql
-- 应该返回156
SELECT COUNT(*) FROM camera_ytb WHERE camera_metadata IS NOT NULL;

-- 查看关键摄像头
SELECT camera_id, camera_metadata->>'primaryType', camera_metadata->>'isFarpoint'
FROM camera_ytb
WHERE camera_id IN (1, 7, 11, 2);
```

**预期结果**:
```
count: 156

camera_id | primaryType   | isFarpoint
----------|---------------|------------
1         | aurora        | false
7         | street        | false
11        | city-skyline  | true
2         | mountain      | true
```

### Step 2: 验证算法集成

在你的API路由中添加日志：

```typescript
import { scoreCameraWeather } from '@/lib/client-ranking-v2';
import { parseCameraMetadata } from '@/lib/camera-metadata-types';

const metadata = parseCameraMetadata(camera.camera_metadata);
console.log('使用v2算法:', metadata?.primaryType);

const evaluation = scoreCameraWeather(weather, now, {
  cameraMetadata: metadata,
  timezone: camera.timezone,
});

console.log('评分结果:', evaluation.score);
```

触发API并查看日志输出。

---

## 🐛 常见问题

### Q1: `quick_verify_v2.ts` 报错 "Database incomplete"

**原因**: 数据库迁移未完成

**解决**:
1. 检查是否执行了两个SQL文件（001和002）
2. 在Supabase执行验证查询：
   ```sql
   SELECT COUNT(*) FROM camera_ytb WHERE camera_metadata IS NOT NULL;
   ```
3. 如果不是156，重新执行 `002_update_all_camera_metadata.sql`

### Q2: 测试脚本报错 "Cannot find module '@/lib/client-ranking-v2'"

**原因**: TypeScript路径别名问题

**解决**:
```bash
# 确保在项目根目录运行
cd /Users/jia/web_app_dev/sunset-earth

# 检查tsconfig.json中的paths配置
cat tsconfig.json | grep "@"

# 重新运行
npx tsx scripts/quick_verify_v2.ts
```

### Q3: Aurora测试失败 "Score is not 0 during daytime"

**原因**:
1. 使用了旧算法（v1）
2. 元数据解析失败
3. 白天定义判断错误

**解决**:
```typescript
// 检查导入
import { scoreCameraWeather } from '@/lib/client-ranking-v2';  // ✅ 正确
// import { scoreCameraWeather } from '@/lib/client-ranking';  // ❌ 错误，这是v1

// 检查元数据
const metadata = parseCameraMetadata(camera.camera_metadata);
console.log('Metadata:', metadata);
// 应该看到: { primaryType: 'aurora', viewingTime: { nightOnly: true } }

// 检查评分结果
const evaluation = scoreCameraWeather(weather, now, { cameraMetadata: metadata });
console.log('Evaluation:', evaluation);
// 白天时应该: { score: 0, ... }
```

### Q4: Farpoint能见度测试失败

**原因**: 天气数据中缺少visibility字段

**解决**:
```typescript
// 确保天气数据包含visibility
const weather = {
  // ...
  hourly: {
    weathercode: [0],
    visibility: [20000],  // ✅ 必须有这个字段
    cloudcover: [10],
    precipitation: [0],
    snowfall: [0],
  },
};
```

---

## 📊 性能基准

正常情况下的性能指标：

| 操作 | 预期时间 |
|------|---------|
| 单个摄像头评分 | <5ms |
| 156个摄像头批量评分 | <500ms |
| 数据库查询元数据 | <100ms |
| 快速验证脚本 | ~30秒 |
| 完整测试套件 | ~1-2分钟 |

**告警阈值**:
- ⚠️ 单个评分>50ms → 需要优化
- ⚠️ 0分摄像头>70% → 检查逻辑

---

## 🔗 相关文档

- [算法重构文档](../docs/ALGORITHM_REFACTOR_2025.md)
- [迁移指南](../docs/MIGRATION_GUIDE_V2.md)
- [数据库迁移README](./migrations/README.md)

---

## 变更日志

### 2025-12-18
- 创建快速验证脚本 `quick_verify_v2.ts`
- 创建完整测试套件 `test_algorithm_v2.ts`
- 添加测试指南文档
