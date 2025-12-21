# 数据库迁移指南

## 📋 迁移文件列表

### 001_add_camera_metadata.sql
添加 `camera_metadata` JSONB字段到 `camera_ytb` 表

### 002_update_all_camera_metadata.sql
批量更新所有156个摄像头的元数据

---

## 🚀 执行步骤

### 方法1: Supabase SQL Editor（推荐）

1. 打开 Supabase Dashboard
2. 进入 SQL Editor
3. 按顺序执行以下SQL文件：

**Step 1: 添加字段和索引**
```sql
-- 复制粘贴 001_add_camera_metadata.sql 的全部内容
-- 执行
```

**Step 2: 更新所有摄像头数据**
```sql
-- 复制粘贴 002_update_all_camera_metadata.sql 的全部内容
-- 执行
```

**Step 3: 验证结果**
```sql
-- 查看更新了多少个摄像头
SELECT COUNT(*) as updated_cameras
FROM camera_ytb
WHERE camera_metadata IS NOT NULL;
-- 应该返回: 156

-- 查看各类型摄像头分布
SELECT
  camera_metadata->>'primaryType' as primary_type,
  COUNT(*) as count
FROM camera_ytb
WHERE camera_metadata IS NOT NULL
GROUP BY camera_metadata->>'primaryType'
ORDER BY count DESC;

-- 查看farpoint分布
SELECT
  camera_metadata->>'isFarpoint' as is_farpoint,
  COUNT(*) as count
FROM camera_ytb
WHERE camera_metadata IS NOT NULL
GROUP BY camera_metadata->>'isFarpoint';
-- 应该返回: true: 38, false: 118
```

---

### 方法2: psql命令行

```bash
# 连接到数据库
psql $DATABASE_URL

# 执行迁移
\i scripts/migrations/001_add_camera_metadata.sql
\i scripts/migrations/002_update_all_camera_metadata.sql

# 验证
SELECT COUNT(*) FROM camera_ytb WHERE camera_metadata IS NOT NULL;
```

---

## ✅ 验证清单

- [ ] `camera_metadata` 字段已添加
- [ ] 索引已创建（`idx_camera_metadata_primary_type`, `idx_camera_metadata_farpoint`, `idx_camera_metadata_tier`, `idx_camera_metadata_gin`）
- [ ] 156个摄像头元数据已更新
- [ ] 数据分布正确：
  - 38个farpoint摄像头
  - 3个Aurora（仅夜晚）
  - 12个事件导向摄像头
  - Tier分布：t0(26), t1(52), t2(87), t3(1)

---

## 🔄 回滚方案

如果需要回滚：

```sql
-- 方案1: 清空元数据（保留字段）
UPDATE camera_ytb SET camera_metadata = NULL;

-- 方案2: 完全删除字段和索引
DROP INDEX IF EXISTS idx_camera_metadata_primary_type;
DROP INDEX IF EXISTS idx_camera_metadata_farpoint;
DROP INDEX IF EXISTS idx_camera_metadata_tier;
DROP INDEX IF EXISTS idx_camera_metadata_gin;
ALTER TABLE camera_ytb DROP COLUMN IF EXISTS camera_metadata;
```

---

## 📊 元数据示例

**Camera #1 (Aurora)**:
```json
{
  "primaryType": "aurora",
  "isFarpoint": false,
  "tier": "t2",
  "resolution": "1080p",
  "viewingTime": {
    "dayOnly": false,
    "nightOnly": true,
    "noSleepTime": false,
    "anytime": false
  },
  "weatherTolerance": {
    "clear": true,
    "partlyCloudy": false,
    "lightRain": false,
    "lightSnow": false
  }
}
```

**Camera #11 (Taipei City Skyline)**:
```json
{
  "primaryType": "city-skyline",
  "isFarpoint": true,
  "tier": "t2",
  "resolution": "4k",
  "viewingTime": {
    "dayOnly": false,
    "nightOnly": false,
    "noSleepTime": false,
    "anytime": true
  },
  "weatherTolerance": {
    "clear": true,
    "partlyCloudy": true,
    "lightRain": false,
    "lightSnow": false
  }
}
```

---

## 🐛 故障排除

### 问题: 某些UPDATE语句失败

**原因**: camera_id不存在（已删除的摄像头）

**解决**: 这是正常的。以下camera_id已被删除，会跳过：
33, 37, 49, 56, 65, 67, 76, 79, 83, 85, 87, 110, 118, 162

### 问题: 索引创建失败

**原因**: 索引已存在

**解决**: 使用 `IF NOT EXISTS` 子句，或先删除旧索引：
```sql
DROP INDEX IF EXISTS idx_camera_metadata_primary_type;
```

---

## 📝 变更日志

### 2025-12-18
- 初始迁移
- 添加camera_metadata字段
- 批量更新156个摄像头元数据
