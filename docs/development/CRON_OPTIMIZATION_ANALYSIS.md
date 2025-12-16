# Cron 任务执行顺序分析与优化建议

## 📊 当前执行时间表

```
每天执行时间线:
00:00 UTC - refresh-links      ⚙️ 检查摄像头可用性
00:30 UTC - compute-rankings   🆕 计算排名 (每30分钟)
01:00 UTC - weather-cache      ☁️ 刷新天气缓存
01:30 UTC - compute-rankings   🆕 计算排名
02:00 UTC - compute-rankings   🆕 计算排名
...
12:00 UTC - replace-link       🔄 替换失效链接
12:30 UTC - compute-rankings   🆕 计算排名
...
23:30 UTC - compute-rankings   🆕 计算排名
```

---

## 🔍 依赖关系分析

### **任务依赖图**

```
┌────────────────────────────────────────────────────────────┐
│                   数据源层 (原始数据)                       │
├────────────────────────────────────────────────────────────┤
│  camera_ytb 表                                             │
│  ├─ link (YouTube链接)                                     │
│  ├─ link_available (可用性状态)                            │
│  └─ lat, lng (坐标)                                        │
└────────────────────────────────────────────────────────────┘
                        ↓
┌────────────────────────────────────────────────────────────┐
│              Cron 任务层 (更新基础数据)                     │
├────────────────────────────────────────────────────────────┤
│  00:00 - refresh-links                                     │
│  ├─ 更新 camera_ytb.link_available                         │
│  └─ 清理空房间                                             │
│                                                            │
│  01:00 - weather-cache                                     │
│  ├─ 写入 camera_weather_cache                              │
│  ├─ 写入 camera_weather_history                            │
│  └─ 写入 camera_sun_cache                                  │
│                                                            │
│  12:00 - replace-link                                      │
│  ├─ 更新 camera_ytb.link                                   │
│  └─ 更新 camera_ytb.link_available                         │
└────────────────────────────────────────────────────────────┘
                        ↓
┌────────────────────────────────────────────────────────────┐
│           计算层 (依赖上层数据)                             │
├────────────────────────────────────────────────────────────┤
│  */30 - compute-rankings                                   │
│  ├─ 读取 camera_ytb.link_available ⚠️ 依赖 refresh-links  │
│  ├─ 读取 camera_weather_cache      ⚠️ 依赖 weather-cache  │
│  ├─ 调用 isCameraAvailable()                               │
│  ├─ 调用 fetchWeatherSnapshot()                            │
│  └─ 写入 camera_rankings                                   │
└────────────────────────────────────────────────────────────┘
                        ↓
┌────────────────────────────────────────────────────────────┐
│                  用户查询层                                 │
├────────────────────────────────────────────────────────────┤
│  GET /api/best-camera                                      │
│  └─ 读取 camera_rankings (最终消费者)                      │
└────────────────────────────────────────────────────────────┘
```

---

## ⚠️ 发现的问题

### **问题1: 数据更新与计算时间冲突**

```
❌ 当前情况:
00:00 - refresh-links 开始 (预计5-10分钟)
00:30 - compute-rankings 执行
        ├─ refresh-links 可能还在运行
        ├─ link_available 数据可能不完整
        └─ 可能读取到旧的可用性状态

01:00 - weather-cache 开始 (预计2-5分钟)
01:30 - compute-rankings 执行
        ├─ weather-cache 可能还在运行
        ├─ 缓存数据可能不完整
        └─ 可能读取到旧的天气数据
```

### **问题2: 执行频率不匹配**

```
compute-rankings: 每30分钟执行一次 (48次/天)
  ├─ 依赖 refresh-links: 每天1次
  ├─ 依赖 weather-cache: 每天1次
  └─ 大部分时间都在读取同样的基础数据 (效率低)

理想情况:
  ├─ 基础数据更新后 → 立即触发排名计算
  └─ 其他时间按需降低频率
```

### **问题3: 时区不敏感**

```
00:00 UTC =
  ├─ 北京时间 08:00 (白天)
  ├─ 纽约时间 19:00/20:00 (傍晚)
  └─ 伦敦时间 00:00 (午夜)

问题:
  ├─ 在不同时区的黄金时段，更新频率应该不同
  └─ 当前固定30分钟可能不是最优
```

---

## ✅ 优化方案

### **方案A: 串行执行 + 增加延迟（保守方案）**

```json
{
  "crons": [
    {
      "path": "/api/refresh-links",
      "schedule": "0 0 * * *"
    },
    {
      "path": "/api/weather-cache",
      "schedule": "15 0 * * *"
    },
    {
      "path": "/api/compute-rankings",
      "schedule": "30 0 * * *"
    },
    {
      "path": "/api/compute-rankings",
      "schedule": "0,30 1-11,13-23 * * *"
    },
    {
      "path": "/api/replace-link",
      "schedule": "0 12 * * *"
    },
    {
      "path": "/api/compute-rankings",
      "schedule": "30 12 * * *"
    }
  ]
}
```

**执行顺序:**
```
00:00 - refresh-links 开始 (5-10分钟)
00:15 - weather-cache 开始 (2-5分钟)
00:30 - compute-rankings 首次执行 ✅ (基础数据已更新)
01:00 - compute-rankings
01:30 - compute-rankings
...
12:00 - replace-link 开始 (5-10分钟)
12:30 - compute-rankings ✅ (链接已更新)
...
```

**优点:**
- ✅ 避免并发冲突
- ✅ 确保基础数据更新完成后再计算
- ✅ 简单可靠

**缺点:**
- ❌ 00:00-00:30 期间数据可能过期
- ❌ cron 配置复杂

---

### **方案B: 智能触发 + 降低频率（推荐方案）**

```json
{
  "crons": [
    {
      "path": "/api/refresh-links",
      "schedule": "0 0 * * *"
    },
    {
      "path": "/api/weather-cache",
      "schedule": "0 2 * * *"
    },
    {
      "path": "/api/compute-rankings",
      "schedule": "0 3,6,9,12,15,18,21 * * *"
    },
    {
      "path": "/api/replace-link",
      "schedule": "0 12 * * *"
    }
  ]
}
```

**执行顺序:**
```
00:00 - refresh-links (10分钟内完成)
02:00 - weather-cache (5分钟内完成)
03:00 - compute-rankings ✅ (所有基础数据已更新)
06:00 - compute-rankings
09:00 - compute-rankings
12:00 - replace-link (10分钟内完成)
15:00 - compute-rankings
18:00 - compute-rankings
21:00 - compute-rankings
```

**调整说明:**
1. **每3小时**计算一次排名（从每30分钟降低到每3小时）
2. **weather-cache 移到 02:00**，避免与 refresh-links 冲突
3. **compute-rankings 从 03:00 开始**，确保所有基础数据已更新

**优点:**
- ✅ 避免并发冲突
- ✅ 降低计算频率（节省成本）
- ✅ 3小时仍能保持数据足够新鲜
- ✅ 简化 cron 配置

**缺点:**
- ⚠️ 数据新鲜度从30分钟降至3小时

---

### **方案C: 高峰时段密集计算（最优方案）**

```json
{
  "crons": [
    {
      "path": "/api/refresh-links",
      "schedule": "0 0 * * *"
    },
    {
      "path": "/api/weather-cache",
      "schedule": "0 2 * * *"
    },
    {
      "path": "/api/compute-rankings",
      "schedule": "0 3,9,21 * * *"
    },
    {
      "path": "/api/compute-rankings",
      "schedule": "*/30 10-20 * * *"
    },
    {
      "path": "/api/replace-link",
      "schedule": "0 12 * * *"
    }
  ]
}
```

**执行逻辑:**
```
00:00 - refresh-links
02:00 - weather-cache
03:00 - compute-rankings (基础更新后首次计算)
09:00 - compute-rankings (早高峰前)

10:00-20:00 - 每30分钟计算一次 (全球日出日落高峰时段)
  ├─ 10:00, 10:30, 11:00, ..., 20:00
  └─ 覆盖主要时区的日出日落时段

21:00 - compute-rankings (晚高峰后)
12:00 - replace-link (中午维护)
```

**时区覆盖分析:**
```
10:00 UTC =
  ├─ 北京 18:00 (日落时段) ✅
  ├─ 东京 19:00 (日落时段) ✅
  ├─ 伦敦 10:00 (日出后)

14:00 UTC =
  ├─ 伦敦 14:00 (下午)
  ├─ 巴黎 15:00 (下午)
  ├─ 开罗 16:00 (傍晚)

18:00 UTC =
  ├─ 纽约 13:00 (下午)
  ├─ 洛杉矶 10:00 (上午)
  ├─ 伦敦 18:00 (日落时段) ✅

20:00 UTC =
  ├─ 纽约 15:00 (下午)
  ├─ 洛杉矶 12:00 (中午)
  ├─ 伦敦 20:00 (日落后)
```

**优点:**
- ✅ 避免并发冲突
- ✅ 高峰时段（10:00-20:00 UTC）数据新鲜
- ✅ 低峰时段减少计算（节省成本）
- ✅ 覆盖全球主要时区的日出日落时段

**缺点:**
- ⚠️ 配置稍复杂
- ⚠️ 需要观察实际流量分布验证

---

## 📈 成本效益对比

| 方案 | 执行频率 | 每天执行次数 | 并发风险 | 数据新鲜度 | 推荐度 |
|------|---------|------------|---------|-----------|--------|
| **当前** | 每30分钟 | 48次 | ⚠️ 高 | 优秀 | ⭐⭐ |
| **方案A** | 变频 | 46次 | ✅ 低 | 优秀 | ⭐⭐⭐ |
| **方案B** | 每3小时 | 8次 | ✅ 低 | 良好 | ⭐⭐⭐⭐ |
| **方案C** | 变频高峰密集 | 28次 | ✅ 低 | 优秀 | ⭐⭐⭐⭐⭐ |

---

## 🎯 推荐实施步骤

### **第一阶段: 立即修复（方案B）**

目标: 消除并发冲突

```bash
# 修改 vercel.json
vim vercel.json
```

### **第二阶段: 观察优化（1-2周后）**

1. 收集数据:
   - 用户访问时间分布
   - 排名变化频率
   - 天气变化频率

2. 根据数据决定是否采用方案C

### **第三阶段: 长期优化**

可能的改进:
1. **按需触发**: weather-cache 完成后自动触发 compute-rankings
2. **智能频率**: 根据历史数据动态调整计算频率
3. **区域化**: 不同时区使用不同的计算策略

---

## 💡 额外优化建议

### **1. 添加任务链式触发**

在 `weather-cache` 完成后自动触发 `compute-rankings`:

```typescript
// app/api/weather-cache/route.ts
export async function GET(request: NextRequest) {
  // ... 现有逻辑

  // 完成后触发排名计算
  try {
    const baseUrl = request.nextUrl.origin;
    await fetch(`${baseUrl}/api/compute-rankings`, {
      headers: {
        'Authorization': `Bearer ${process.env.CRON_SECRET}`
      }
    });
  } catch (error) {
    console.warn('[weather-cache] failed to trigger rankings', error);
  }

  return NextResponse.json(summary);
}
```

### **2. 添加任务执行监控**

创建一个监控端点查看所有任务状态:

```typescript
// app/api/cron-status/route.ts
GET /api/cron-status

返回:
{
  "refresh-links": {
    "lastRun": "2025-11-30T00:00:00Z",
    "status": "success",
    "duration": 8500
  },
  "weather-cache": {
    "lastRun": "2025-11-30T02:00:00Z",
    "status": "success",
    "duration": 3200
  },
  "compute-rankings": {
    "lastRun": "2025-11-30T03:00:00Z",
    "status": "success",
    "duration": 12000
  }
}
```

---

## 📊 总结

### **当前问题严重程度评估**

| 问题 | 严重程度 | 影响 |
|------|---------|------|
| 00:30 计算时 refresh-links 可能未完成 | 🟡 中等 | 可能使用旧的可用性数据 |
| 01:30 计算时 weather-cache 可能未完成 | 🟡 中等 | 可能使用旧的天气数据 |
| 执行频率过高 | 🟢 低 | 浪费计算资源，但不影响功能 |

### **推荐方案: 方案C（高峰密集）**

立即修改为**方案B**（保守），观察1-2周后再考虑**方案C**。

---

需要我帮你实施某个方案吗？
