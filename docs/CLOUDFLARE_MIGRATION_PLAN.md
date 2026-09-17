# 全面迁移到 Cloudflare — 脱离 Supabase 改造清单

> 目标:**完全脱离 Supabase 与 Vercel**,数据与运行时全部落在 Cloudflare。
> 状态:Vercel 已脱离 ✅ · 聊天室已移除 ✅ · **Supabase 代码层已迁移完成 ✅**
>
> ⚠️ **剩余人工步骤**:创建 D1 数据库、填 `database_id`、导入 `camera_ytb` 数据。
> 具体命令见 [`d1/README.md`](../d1/README.md)。下文保留为迁移决策记录。

---

## 0. 结论速览

好消息:**项目只是把 Supabase 当普通 SQL 数据库用**——没有用 Auth、Storage、Realtime 订阅、
Row Level Security、Edge Functions。所以迁移**没有身份体系或实时通道需要重建**,
本质是"换一个数据库 + 重写数据访问层"。

数据量极小(约 170 台相机),**Cloudflare D1(SQLite)完全够用,且在免费额度内**。

| 项 | 现状 | 迁移到 |
| --- | --- | --- |
| 关系数据 | Supabase Postgres | **D1**(SQLite) |
| 天气缓存 | `camera_weather_cache` 表 | **KV**(带原生 TTL)或留在 D1 |
| 任务锁 | `task_locks` 表 + Postgres 唯一约束 | **Durable Object**(或简化掉,见 §4) |
| 排名算法 / 天气打分 | 纯计算,不碰 DB | **不动** |
| 前端 UI | 无 Supabase 调用 | **不动** |

---

## 1. 实际用到的 Supabase 面(已核实)

### 1.1 表清单 — 8 张,其中 3 张是死的

| 表 | 应用内引用 | 处理 |
| --- | --- | --- |
| `camera_ytb` | 22 处 | ✅ 必须迁移(**核心数据**) |
| `camera_rankings` | 13 处 | ✅ 必须迁移(可由 cron 重算) |
| `camera_weather_cache` | 读+写 | ✅ 迁移(或改用 KV) |
| `task_locks` | 读+写 | ⚠️ 见 §4,可能可以砍掉 |
| `camera_sun_cache` | **只写不读** | ❌ **直接删除** |
| `camera_weather_history` | **只写不读** | ❌ **直接删除** |
| `camera_sun_history` | **只写不读** | ❌ **直接删除** |
| `rooms` | — | ✅ 已随聊天室移除 |

> 3 张 history/sun_cache 表只有 `insert`/`upsert`、从无 `select`,是纯写入开销。
> 迁移时直接不建,顺手省掉每台相机每轮 2~3 次写请求(对 Workers 子请求配额是实打实的节省)。

### 1.2 需要重写的数据访问代码

**61 处 `supabaseAdmin` 调用,分布在 14 个应用文件**(另有 ~10 个 scripts):

| 文件 | 调用数 |
| --- | --- |
| `lib/weather.ts` | 7 |
| `lib/task-lock.ts` | 7 |
| `app/api/rankings-health/route.ts` | 5 |
| `app/api/cron-status/route.ts` | 5 |
| `lib/cameras.ts` | 4 |
| `app/api/best-camera/route.ts` | 4 |
| `lib/rankings.ts` | 3 |
| `app/api/refresh-links/route.ts` | 3 |
| 其余 6 个文件 | 各 2 |

全部使用 Supabase 的 **PostgREST 链式查询构建器**(`.from().select().eq().order()`),
D1 用的是**原生 SQL** —— 这些调用点需要逐一改写。这是本次迁移的**主要工作量**。

---

## 2. Postgres → SQLite 的语义差异(容易踩坑的点)

| Postgres / Supabase | D1 (SQLite) | 影响 |
| --- | --- | --- |
| `jsonb` (`camera_metadata`, weather `data`) | 无此类型 → 存 `TEXT`,手动 `JSON.stringify/parse` | 需改映射层 |
| `timestamptz` | 无时间类型 → 存 ISO8601 **UTC** 字符串 | 现有 `.gte(computed_at, ...)` 依赖时间比较;ISO UTC 串**字典序=时间序**,前提是**全部统一 UTC 格式** |
| `BIGSERIAL` | `INTEGER PRIMARY KEY AUTOINCREMENT` | schema 改写 |
| 唯一冲突错误码 `23505` | SQLite 报 `SQLITE_CONSTRAINT` 文本 | `lib/task-lock.ts:41` 的判断逻辑要改 |
| `.upsert()` | `INSERT ... ON CONFLICT(...) DO UPDATE` | 3 处 upsert 需重写 |
| `.select(count: "exact")` | 需单独 `SELECT COUNT(*)` | `lib/rankings.ts` 需改 |
| **RPC `get_avg_score()`** | 无存储过程 → 改成 `SELECT AVG(score)` | ⚠️ 见下方风险 |

---

## 3. ⚠️ 两个必须先解决的阻塞项

### 3.1 `camera_ytb` 的表结构不在仓库里
最核心的表(22 处引用)**没有任何 migration 文件**,schema 只存在于线上 Supabase。
`supabase/migrations/` 里只有 rankings / weather_cache / task_locks / following_events / pool_id。

**必须做**:从现有 Supabase 导出 `camera_ytb` 的 DDL + 数据,才能在 D1 重建。
列名可从 `lib/cameras.ts:4` 的 `CAMERA_COLUMNS` 反推:
`camera_id, link, placename, city, country, latitude, longitude, timezone, info_0, tag,
host_link, ytb_title, link_available, sunset_delay, sunrise_advance, last_check, camera_metadata`

### 3.2 `get_avg_score` 存储过程也不在仓库里
`app/api/rankings-health/route.ts:49` 调用了 Postgres 函数 `get_avg_score`,
其定义同样只在线上。迁移时改写成普通 SQL 即可(`SELECT AVG(score) FROM camera_rankings`),
但要注意它原本是否有额外过滤条件。

> **行动**:这两项都需要**趁 Supabase 还在**先导出。一旦停掉 Supabase 就拿不回来了。

---

## 4. 任务锁可能可以整个砍掉(值得重新评估)

`task_locks` 的存在理由写在文档里:*"防止 serverless 多实例并发执行 cron"* —— 这是 **Vercel 的问题**。

Cloudflare Cron Triggers 的调度是**全局单次触发**,不会像 Vercel 那样并发拉起多个实例。
因此锁的原始动机基本消失。三个选择:

1. **直接删掉** `lib/task-lock.ts` 和 `task_locks` 表 —— 最省事,少一张表少一堆查询
2. **保留但换 Durable Object** —— DO 是 Cloudflare 上做分布式锁的正统原语,真正原子
3. 保留在 D1 —— 可行但没必要

> 注:`compute-rankings` 目前会检查 `weather-cache` 是否在跑(`isTaskLocked`),
> 这个"避免读到半新不旧的天气数据"的编排意图仍有价值,砍锁前需要确认这层依赖怎么处理。

---

## 5. 建议的迁移顺序

1. **先导出**(趁 Supabase 还活着)
   - `camera_ytb` 的 DDL + 全量数据(约 170 行)
   - `get_avg_score` 函数定义
   - `camera_rankings` 数据(可选,cron 会重算)
2. **写 D1 schema**:4 张表(`camera_ytb` / `camera_rankings` / `camera_weather_cache` / 可选 `task_locks`),
   补上仓库里缺失的 `camera_ytb` migration
3. **建数据访问层**:新增 `lib/db.ts` 封装 D1,提供与现有函数**同名同签名**的替代
   (`listCameras`、`fetchAvailableRankings` …),这样上层路由改动最小
4. **逐文件替换** 61 处调用,从 `lib/cameras.ts` / `lib/rankings.ts` 这些底层开始
5. **接 D1 binding**:`wrangler.jsonc` 加 `d1_databases`,`npm run cf-typegen` 重新生成类型
6. **导入数据 + 验证**:`wrangler d1 execute --file=...`,然后手动触发 cron 验证全链路
7. **删除** `@supabase/supabase-js` 依赖与 `lib/supabaseAdmin.ts`

---

## 6. 一个必须知道的架构约束

D1 的 binding(`env.DB`)**只能从 Cloudflare 请求上下文里拿到**,不像 Supabase 客户端那样
可以在任意模块顶层 import 一个全局单例。

OpenNext 提供 `getCloudflareContext()` 来访问,但这意味着:
- 现有那种"模块顶层 `import { supabaseAdmin }` 直接用"的写法要改成**函数内获取**
- `scripts/` 下那些直连数据库的本地脚本**无法再用同一套代码**,
  需要改用 `wrangler d1 execute` 或 D1 HTTP API

这是把数据访问层集中封装到 `lib/db.ts` 的另一个理由。

---

## 7. 工作量与风险评估

| 项 | 评估 |
| --- | --- |
| 数据访问层重写(61 处) | **主要工作量**,机械但量大 |
| Schema 转换(4 表) | 小,但受阻于 §3.1 |
| 数据迁移(~170 行) | 小 |
| 算法 / UI | **零改动** |
| 主要风险 | ①`camera_ytb` schema 丢失 ②时间字段格式不统一导致比较出错 ③JSON 字段手动序列化遗漏 |

**免费额度**:D1 免费档 5GB 存储 / 500 万行读每天,本项目用量远低于此。
配合之前评估的 Workers Paid($5/月,为批量 cron 的子请求配额),整体成本不变。
