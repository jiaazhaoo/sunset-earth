# 任务锁实现 - 解决竞态条件

## 问题背景

### 发现的问题
生产环境和开发环境的摄像头顺序始终不变，经过分析发现根本原因是**竞态条件（Race Condition）**。

### 竞态条件的原因

根据 `vercel.json` 的 cron 配置：
- `/api/weather-cache`: 每3小时运行一次（09:00, 12:00, 15:00...）
- `/api/compute-rankings`: 每5分钟运行一次（09:00, 09:05, 09:10...）

在 09:00:00 时刻：
1. `weather-cache` cron 触发，开始批量获取91个摄像头的天气数据
2. `compute-rankings` cron **同时也被触发**（因为09:00是5的倍数）
3. 某些摄像头（如camera 5, 37, 72, 73）的天气数据还没完成时，`compute-rankings` 就开始执行
4. 这些摄像头的 `getCachedWeatherSnapshot` 返回 `null`，被跳过
5. 它们的 `computed_at` 停留在上一次成功的时间（08:00:28）

## 解决方案

### 1. 创建任务锁表

新增数据库表 `task_locks` 用于分布式锁：

```sql
-- supabase/migrations/20250312_add_task_locks.sql
CREATE TABLE IF NOT EXISTS public.task_locks (
  task_name TEXT PRIMARY KEY,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_by TEXT,
  expires_at TIMESTAMPTZ NOT NULL
);
```

### 2. 实现任务锁工具库

创建 `lib/task-lock.ts` 提供：
- `acquireTaskLock()`: 获取锁
- `releaseTaskLock()`: 释放锁
- `isTaskLocked()`: 检查锁状态
- `withTaskLock()`: 自动加锁/解锁执行函数

### 3. 更新 weather-cache API

使用 `withTaskLock` 包装执行逻辑：
- 防止多个 weather-cache 实例同时运行
- 获取锁后才开始更新天气数据
- 完成后自动释放锁

### 4. 更新 compute-rankings API

添加两层保护：
1. **等待天气缓存完成**：检查 `weather-cache` 锁，如果还在运行则跳过
2. **防止并发执行**：使用自己的锁防止多个实例同时运行

```typescript
// Check if weather-cache is still running
const weatherCacheRunning = await isTaskLocked("weather-cache");
if (weatherCacheRunning) {
  // Skip and wait for next cron cycle
  return { skipped: true, reason: "weather-cache is still running" };
}

// Execute with task lock
await withTaskLock("compute-rankings", async () => {
  // ... compute rankings logic
});
```

## 工作流程

### 正常情况（09:00）

```
09:00:00 - weather-cache 获取锁 ✅
09:00:00 - compute-rankings 检测到 weather-cache 锁，跳过 ⏭️
09:00:31 - weather-cache 更新完成
09:00:45 - weather-cache 触发 compute-rankings
09:00:45 - compute-rankings 获取锁 ✅
09:00:45 - compute-rankings 开始计算（所有天气数据已准备好）
09:01:28 - compute-rankings 完成并释放锁 ✅

09:05:00 - compute-rankings cron 触发
09:05:00 - weather-cache 没有运行，开始执行 ✅
```

### 异常情况（锁超时）

如果某个任务崩溃没有释放锁：
- 锁有 TTL（默认600秒/10分钟）
- 下次任务执行时会自动清理过期的锁
- 不会导致永久死锁

## 文件变更

### 新增文件
1. `supabase/migrations/20250312_add_task_locks.sql` - 任务锁表
2. `lib/task-lock.ts` - 任务锁工具库

### 修改文件
1. `app/api/weather-cache/route.ts` - 添加任务锁
2. `app/api/compute-rankings/route.ts` - 添加等待机制和任务锁

## 部署步骤

1. **运行数据库迁移**：
   ```bash
   # 在 Supabase Dashboard 或通过 CLI 执行
   supabase migration up
   ```

2. **部署代码**：
   ```bash
   git add .
   git commit -m "feat: add task locks to prevent race conditions"
   git push
   ```

3. **验证**：
   - 检查 Supabase 中 `task_locks` 表已创建
   - 观察 cron job 日志，确认不再出现竞态条件
   - 确认所有摄像头的 `computed_at` 时间一致

## 优势

✅ **解决竞态条件**：weather-cache 和 compute-rankings 不会同时运行
✅ **保证数据完整性**：compute-rankings 总是在天气数据准备好后运行
✅ **自动恢复**：锁有超时机制，防止永久死锁
✅ **可观察性**：返回明确的跳过原因，方便调试
✅ **分布式安全**：使用数据库实现锁，支持多实例部署

## 注意事项

- 保持 `vercel.json` 中的两个 cron 配置不变
- weather-cache 仍然会在完成后链式触发 compute-rankings
- compute-rankings 的独立 cron 作为备份，如果链式调用失败，下个5分钟周期会重试
