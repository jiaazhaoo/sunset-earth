# 部署检查清单 - Task Locks & Ranking Fixes

## ✅ 代码已部署
- Commit: `d01c3c5`
- 分支: `main`
- 状态: 已推送到 GitHub

## 🔧 必须的数据库迁移

### 1. 运行 Task Locks Migration

**方法A: Supabase Dashboard (推荐)**
1. 打开 Supabase Dashboard
2. 进入 SQL Editor
3. 执行以下SQL:

```sql
-- Create task locks table for preventing concurrent execution
CREATE TABLE IF NOT EXISTS public.task_locks (
  task_name TEXT PRIMARY KEY,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_by TEXT,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_locks_expires_at ON public.task_locks(expires_at);

COMMENT ON TABLE public.task_locks IS 'Distributed locks for preventing concurrent task execution';
COMMENT ON COLUMN public.task_locks.task_name IS 'Unique identifier for the task (e.g., weather-cache, compute-rankings)';
COMMENT ON COLUMN public.task_locks.locked_at IS 'When the lock was acquired';
COMMENT ON COLUMN public.task_locks.locked_by IS 'Optional identifier of the process holding the lock';
COMMENT ON COLUMN public.task_locks.expires_at IS 'When the lock expires (for automatic cleanup of stale locks)';
```

**方法B: Supabase CLI**
```bash
supabase migration up
```

### 2. 验证迁移

在 Supabase Dashboard 运行:
```sql
-- 检查表是否创建成功
SELECT * FROM information_schema.tables WHERE table_name = 'task_locks';

-- 检查索引是否创建
SELECT * FROM pg_indexes WHERE tablename = 'task_locks';
```

应该看到:
- ✅ `task_locks` 表存在
- ✅ `task_locks_pkey` (主键索引)
- ✅ `idx_task_locks_expires_at` (expires_at索引)

## 🚀 Vercel 自动部署

### 预期行为
1. GitHub push 触发 Vercel 自动部署
2. 构建过程应该成功（约2-3分钟）
3. TypeScript 编译通过（无错误）

### 检查部署状态
1. 访问 Vercel Dashboard
2. 查看最新部署状态
3. 确认部署成功（绿色勾号）

## 📊 验证功能

### 1. 检查 Task Locks 是否生效

**测试 weather-cache:**
```bash
# 手动触发 weather-cache
curl -X GET "https://your-domain.com/api/weather-cache" \
  -H "Authorization: Bearer $CRON_SECRET"

# 立即再次触发（应该返回409）
curl -X GET "https://your-domain.com/api/weather-cache" \
  -H "Authorization: Bearer $CRON_SECRET"
```

期望结果:
- ✅ 第一次请求: 200 OK，返回处理结果
- ✅ 第二次请求: 409 Conflict，返回 `{ skipped: true, reason: "..." }`

**测试 compute-rankings:**
```bash
curl -X GET "https://your-domain.com/api/compute-rankings" \
  -H "Authorization: Bearer $CRON_SECRET"
```

期望结果:
- ✅ 如果 weather-cache 正在运行: 409 Conflict
- ✅ 否则: 200 OK，返回计算结果

### 2. 检查排名是否正常

访问主页，检查:
- ✅ 摄像头正常加载
- ✅ 点击"Next camera"时，不会总是看到相同的摄像头
- ✅ 相同分数的摄像头会轮换展示

### 3. 检查数据一致性

在 Supabase Dashboard 运行:
```sql
-- 检查所有摄像头的 computed_at 是否接近
SELECT
  camera_id,
  score,
  available,
  computed_at,
  EXTRACT(EPOCH FROM (NOW() - computed_at)) / 60 AS age_minutes
FROM camera_rankings
ORDER BY computed_at DESC;
```

期望结果:
- ✅ 所有摄像头的 `computed_at` 时间戳应该相近（同一批次）
- ✅ 不应该有停留在旧时间的摄像头（之前的bug）
- ✅ `available=false` 的摄像头也有最新的 `computed_at`

### 4. 检查锁表状态

```sql
-- 查看当前锁状态
SELECT
  task_name,
  locked_at,
  locked_by,
  expires_at,
  EXTRACT(EPOCH FROM (expires_at - NOW())) AS remaining_seconds
FROM task_locks;
```

期望结果:
- ✅ 正常情况下应该是空的（任务完成后锁被释放）
- ✅ 如果看到锁，检查 `remaining_seconds` 是否在合理范围（<600秒）

## 🐛 故障排查

### 问题1: 部署失败

**检查点:**
1. Vercel 构建日志
2. TypeScript 编译错误
3. 环境变量是否正确设置

**解决方案:**
```bash
# 本地测试构建
npm run build

# 检查 TypeScript
npx tsc --noEmit --skipLibCheck
```

### 问题2: Task Locks 不工作

**症状:** 两个任务同时运行，出现竞态条件

**检查:**
```sql
-- 检查 task_locks 表是否存在
\dt task_locks

-- 检查权限
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'task_locks';
```

**解决方案:**
- 确认迁移已运行
- 确认 Supabase service role key 有正确权限

### 问题3: 排名仍然固定

**症状:** 相同分数的摄像头总是返回相同的

**检查:**
```sql
-- 验证二级排序是否生效
SELECT camera_id, score, distance_minutes
FROM camera_rankings
WHERE available = true
ORDER BY score DESC, distance_minutes ASC
LIMIT 10;
```

**解决方案:**
- 确认代码已部署
- 清除浏览器缓存
- 手动触发 rankings 重新计算

### 问题4: 缺少天气缓存的摄像头未更新

**症状:** 某些摄像头的 `computed_at` 仍然很旧

**检查日志:**
```bash
# 查看 Vercel 日志
vercel logs --follow

# 搜索 "missing-weather-cache"
```

**解决方案:**
- 确认新代码已部署（应该更新 rankings）
- 手动触发 weather-cache 和 compute-rankings

## 📈 监控建议

### 每天检查
- [ ] 查看 Vercel 部署日志，确认 cron jobs 正常运行
- [ ] 检查 `task_locks` 表是否有过期未清理的锁
- [ ] 抽查几个摄像头的 `computed_at` 时间

### 每周检查
- [ ] 分析用户观看数据，确认推荐算法效果
- [ ] 检查是否有长期 `available=false` 的摄像头
- [ ] 审查错误日志，识别潜在问题

## ✅ 完成确认

部署成功后，确认以下所有项:

- [ ] ✅ 数据库迁移已运行（`task_locks` 表存在）
- [ ] ✅ Vercel 部署成功（绿色状态）
- [ ] ✅ Task locks 功能正常（409 测试通过）
- [ ] ✅ 排名二级排序生效（摄像头轮换）
- [ ] ✅ 所有摄像头 `computed_at` 一致（无旧时间戳）
- [ ] ✅ 主页正常加载摄像头
- [ ] ✅ "Next camera" 功能正常

---

**部署时间**: _____________
**执行人**: _____________
**验证结果**: [ ] 全部通过 [ ] 有问题（详见下方）

**问题记录**:
