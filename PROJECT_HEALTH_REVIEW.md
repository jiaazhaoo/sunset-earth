# Sunset Earth — 项目重启健康评估报告

> 评估日期:2026-07-15 · 分支:`claude/project-restart-review-aqb9rc`
> 方法:安装依赖 → `tsc --noEmit` → `eslint` → `next build` → 模块引用/死代码扫描

## 总览

项目**架构清晰、文档详尽、核心逻辑设计良好**,但停更后处于"失修"状态。真正会挡住重启的是 **4 个构建/部署级问题**;其余是可控的技术债、文档漂移和一处被夸大的特性。类型系统健康(`tsc` 完全通过)。

| 维度 | 状态 |
| --- | --- |
| TypeScript 类型检查 | ✅ 通过 |
| `next build` | ❌ 失败(`/all-cameras` 预渲染) |
| ESLint | ❌ 45 error + 15 warning |
| 生产主流程逻辑 | ✅ 基本完好 |
| 文档与代码一致性 | ⚠️ 多处漂移 |
| 依赖安全 | ⚠️ 14 漏洞(6 high) |

---

## 🔴 P0 — 会直接卡住构建/部署

### 1. `next build` 失败:`/all-cameras` 被静态预渲染却要拉数据
- **文件**:`app/all-cameras/page.tsx:4` → `export const revalidate = 300`
- **现象**:ISR 让 Next 在 build 时预渲染此页并 fetch Supabase,构建环境拉不到数据就 `Export encountered an error`,整个 build 退出。首页 `app/page.tsx` 因为有 try/catch 兜底才幸免。
- **修复**:该页改为 `export const dynamic = "force-dynamic"`(数据本就是实时的,不该静态化)。

### 2. 环境变量命名三处互相打架
- **代码真相**(`lib/supabaseAdmin.ts`):`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
- `README.md`:`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
- `PROJECT_ORIENTATION.md`:`SUPABASE_SERVICE_KEY` / `SUPABASE_URL`
- **放大器**:`supabaseAdmin.ts` 在**模块加载时**就 `throw`,变量名一错整个 build 立刻崩(首次构建即因此失败)。
- **修复**:以代码为准统一命名;并评估是否把 throw 改成惰性初始化,避免 build 期硬崩。

### 3. 缺失 `.env.example`
- README 明确引用它,但仓库里没有 → 重启时没有配置模板。
- **修复**:补一份,列全 `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `NEXT_PUBLIC_*` / `CRON_SECRET` 及可选的 Cloudflare Realtime 变量。

### 4. Vercel cron 频率可能超套餐限制
- `vercel.json`:`compute-rankings` 每 5 分钟、`weather-cache` 每 3 小时、`replace-link` 每小时。
- Vercel **Hobby 套餐只允许每天一次**的 cron。非 Pro 套餐部署时会被拒。
- **修复**:确认部署套餐;若是 Hobby,需降频或改用外部调度器触发这些受 `CRON_SECRET` 保护的接口。

---

## 🟡 P1 — 代码质量 / 技术债

### 5. 45 个 ESLint error(`npm run lint` 非零退出)
- 主要类别:`@typescript-eslint/no-explicit-any`(大量 `any`)、未使用变量、脚本里的 `require()`、`dev/pools` 用 `<a>` 而非 `<Link>`。
- 当前 `next build` 未被 lint 挡住,但 lint 门禁实际是坏的,CI 若开启会红。

### 6. 遗留 / 重复文件
- `app/api/best-camera/route.old.ts` — **确认无任何引用,死文件**,可删。
- 根目录散落 `test_camera_availability.ts`。
- `scripts/` 下约 40 个一次性 debug 脚本(`debug_138_*`、`reproduce_*`、`trace_scoring_*`、`explain_138_*` 等)与正式工具脚本(`check-cameras.ts`、`run-replace.ts`)混放,建议归档到 `scripts/archive/`。

### 7. 新旧打分算法分叉(易踩坑)
- 生产 cron `compute-rankings` → `lib/client-ranking-v2.ts`
- dev 工具 `app/api/dev/live-rankings` → `lib/client-ranking.ts`(v1)
- **后果**:dev 调试页看到的分数和线上不是同一套算法,排障时会误导。`client-ranking.ts` 的 `CameraEvaluation` 类型仍被 pool 模块引用,所以不能直接删,需要有意识地收敛到 v2。

---

## 🟠 P2 — 文档漂移与被夸大的特性

### 8. "ML-Enhanced Optimization" 名不副实
- README 把它列为核心特性,但整个 pool/ML 子系统(`lib/ml-pool-assignment.ts`、`lib/camera-pool-manager.ts`、`lib/camera-pools.ts`、`data/pool_assignment_model.json`、`scripts/*.py`)**只被 dev 页面 `/app/dev/pools` 和 `/api/camera-pools/current` 使用**,未接入首页 / `best-camera` / `compute-rankings` 任何用户主流程。
- **决策点**:要么正式接入主流程,要么在文档里降级为"实验性 dev 工具",别再当成卖点。

### 9. 文档与 cron 配置不符
- README 说 hourly cron 是 `refresh-links`,`vercel.json` 实际跑的是 `replace-link`。
- README/ORIENTATION 提到的 `poolManager.ts` 实际文件名是 `ml-pool-assignment.ts` / `camera-pool-manager.ts`。
- 多份完成报告(`ALGORITHM_V2_COMPLETION_REPORT.md`、`TIER_IMPLEMENTATION_SUMMARY.md`)散在根目录,建议移入 `docs/`。

### 10. 依赖安全:14 个漏洞(6 high)
- 技术栈很新(Next 16 / React 19),`npm audit` 报 6 high。重启时值得 review 一次,但需谨慎(可能含 breaking change)。

---

## ✅ 健康的部分
- `tsc --noEmit` **完全通过**,类型基础扎实。
- 分层架构(presentation / API / domain lib / Supabase)清晰。
- 分布式任务锁(`task_locks` + `lib/task-lock.ts`)、solar-event 计算、weather 缓存等核心机制设计合理。
- cron 接口有 `CRON_SECRET` 鉴权(注意:仅在设置了该环境变量时生效,未设置则接口公开——建议设为必需)。
- `PROJECT_ORIENTATION.md` 质量很高,是重启的好起点(修正环境变量段落后即可用)。

---

## 建议的重启顺序
1. **P0 全修** → 让项目能干净地 build & deploy(1、2、3、4)。
2. **P1 清债** → 删死文件、归档脚本、清 lint、收敛到 v2 算法(5、6、7)。
3. **P2 校准** → 同步文档、决定 ML 特性去留、过一遍依赖(8、9、10)。
