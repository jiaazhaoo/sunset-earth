
# 🌅 Sunset Earth — V1 需求说明 & 技术栈设计

> 一个极简但可运行的 “全球日落 + 多人一起看直播 + 聊天/语音房间” MVP。

---

# ⭐ 1. 产品愿景（简述）

Sunset Earth 是一个“跨时区共享日落”的 Web App。

用户可以：

* 看到当前全球最美的直播日落摄像头
* 与朋友一起进入同一个房间观看直播
* 实时聊天
* 实时语音通话
* 记录美好瞬间

第一版（V1）目标：

**在三天内搭建一个可运行的 Demo，验证核心体验。**

---

# ⭐ 2. V1 功能需求（MVP）

V1 只做两个页面，但要“整个流程跑通”：

---

## 🟦 2.1 主页（Home）

### 功能：

1. 显示当前  *最佳摄像头* （embed YouTube / 其他可用源）
2. 有一个按钮：**切换摄像头**
3. 切换算法（简化版）：
   * 优先 “天气 = 晴 AND 当前处于日落时间段”
   * 否则 “天气 = 晴 AND 白天”
   * 否则 fallback（随机或固定）
4. 摄像头的元数据包含：
   * id, name
   * embedUrl
   * lat / lng
   * timezone
   * city / country

---

## 🟩 2.2 摄像头详情页 / 房间页（Room）

### 功能：

1. 上半部分：显示摄像头视频（iframe）
2. 下半部分：实时聊天（类似聊天室 UI）
3. “生成分享链接”按钮
   * `/room/{roomId}?camera={cameraId}`
4. 在线人数显示（来自 Presence）
5. 当房间内人数 ≥ 2：
   * 显示“加入语音”按钮
   * 进入 WebRTC 语音房间聊天

---

## 🟧 2.3 其他基础功能

### 房间机制

* 第一次进入 `/room/{cameraId}` 会新建房间并生成一个 `roomId`
* 他人访问 `https://xxx.vercel.app/room/{roomId}` 可加入

### 网络与全球可访问性（V1 范围）

* **V1 不支持中国大陆无 VPN 用户**
* 支持全球 + 使用 VPN 用户

---

# ⭐ 3. 技术栈（Tech Stack）

Sunset Earth V1 技术方案基于 “ **没有服务器的全栈项目** ”。

---

## 🟦 3.1 前端（UI + 页面）

### 技术

* **Next.js 14 （App Router）**
* **React 18**
* **TypeScript**
* **Tailwind CSS**

### 职责

* 页面渲染（Home / Room）
* 摄像头 iframe 播放
* 调用后端 API 获取最佳摄像头
* 调用 Supabase 进行消息实时订阅
* 调用 Daily / LiveKit 进行语音通话

---

## 🟧 3.2 后端（无服务器 Backend）

### 技术

* **Vercel Serverless Functions** （Next.js API Routes）
* 或部分逻辑使用 **Vercel Edge Functions**

### 职责

* `/api/best-camera`
  * 读取摄像头列表
  * 调用天气 API
  * 调用日落 API
  * 计算评分并返回最佳摄像头
* `/api/create-room`
  * 创建一个新房间（写入 Supabase）
* 隐藏 API Keys（天气 / 日落 API）

> 无需 EC2
>
> 无需专门服务器
>
> 无需 Docker
>
> 无需 Nginx
>
> 全自动扩缩容

---

## 🟩 3.3 数据库 + 实时聊天

### 技术

* **Supabase**
  * Postgres
  * Realtime（WebSocket）
  * Presence（在线人数）

### 数据表（V1）

#### rooms

| 字段       | 类型      | 说明             |
| ---------- | --------- | ---------------- |
| id         | uuid      | 房间 ID          |
| camera_id  | text      | 房间对应的摄像头 |
| created_at | timestamp | 创建时间         |

#### messages

| 字段       | 类型      | 说明                  |
| ---------- | --------- | --------------------- |
| id         | uuid      | 消息 ID               |
| room_id    | uuid      | 所属房间              |
| sender     | text      | 发言者昵称 / 随机生成 |
| text       | text      | 消息内容              |
| created_at | timestamp | 时间戳                |

### 聊天

* 使用 Supabase Realtime 订阅 `messages` 表
* 新消息自动推送到所有用户
* 前端实时渲染聊天列表

### 在线人数（Presence）

* 进入房间时：加入 Presence
* 离开房间：自动退出
* 前端订阅 presence 状态流 → 动态显示当前在线人数

---

## 🟧 3.4 语音通话（WebRTC 房间）

### 技术（选一）

* **Daily.co** （推荐，最简单）
* 或 **LiveKit Cloud**

### 职责

* 多人语音通话
* 自动降噪 / 回声消除
* 麦克风选择
* 房间名 = `roomId`

前端调用示例（伪代码）：

<pre class="overflow-visible!" data-start="2564" data-end="2627"><div class="contain-inline-size rounded-2xl relative bg-token-sidebar-surface-primary"><div class="sticky top-9"><div class="absolute end-0 bottom-0 flex h-9 items-center pe-2"><div class="bg-token-bg-elevated-secondary text-token-text-secondary flex items-center gap-4 rounded-sm px-2 font-sans text-xs"></div></div></div><div class="overflow-y-auto p-4" dir="ltr"><code class="whitespace-pre! language-ts"><span><span>call.</span><span>join</span><span>({ </span><span>url</span><span>: </span><span>`https://your.daily.co/${roomId}</span><span>` })
</span></span></code></div></div></pre>

不需要自己搭任何 WebRTC 服务。

---

## 🟫 3.5 摄像头数据（数据源）

摄像头列表存放在前端：

<pre class="overflow-visible!" data-start="2690" data-end="2714"><div class="contain-inline-size rounded-2xl relative bg-token-sidebar-surface-primary"><div class="sticky top-9"><div class="absolute end-0 bottom-0 flex h-9 items-center pe-2"><div class="bg-token-bg-elevated-secondary text-token-text-secondary flex items-center gap-4 rounded-sm px-2 font-sans text-xs"></div></div></div><div class="overflow-y-auto p-4" dir="ltr"><code class="whitespace-pre!"><span><span>/data/cameras.ts
</span></span></code></div></div></pre>

字段包括：

<pre class="overflow-visible!" data-start="2723" data-end="2863"><div class="contain-inline-size rounded-2xl relative bg-token-sidebar-surface-primary"><div class="sticky top-9"><div class="absolute end-0 bottom-0 flex h-9 items-center pe-2"><div class="bg-token-bg-elevated-secondary text-token-text-secondary flex items-center gap-4 rounded-sm px-2 font-sans text-xs"></div></div></div><div class="overflow-y-auto p-4" dir="ltr"><code class="whitespace-pre! language-ts"><span><span>{
  </span><span>id</span><span>: </span><span>string</span><span>
  </span><span>name</span><span>: </span><span>string</span><span>
  </span><span>embedUrl</span><span>: </span><span>string</span><span>
  </span><span>lat</span><span>: </span><span>number</span><span>
  </span><span>lng</span><span>: </span><span>number</span><span>
  </span><span>city</span><span>: </span><span>string</span><span>
  </span><span>country</span><span>: </span><span>string</span><span>
  </span><span>timezone</span><span>: </span><span>string</span><span>
}
</span></span></code></div></div></pre>

来源建议：

* YouTube Live（合法可嵌入）
* EarthCam / Skyline（仅可用其官方 embed 的）
* 政府公开直播（Public Domain）

---

# ⭐ 4. 架构图（文字版）

<pre class="overflow-visible!" data-start="2982" data-end="4199"><div class="contain-inline-size rounded-2xl relative bg-token-sidebar-surface-primary"><div class="sticky top-9"><div class="absolute end-0 bottom-0 flex h-9 items-center pe-2"><div class="bg-token-bg-elevated-secondary text-token-text-secondary flex items-center gap-4 rounded-sm px-2 font-sans text-xs"></div></div></div><div class="overflow-y-auto p-4" dir="ltr"><code class="whitespace-pre!"><span><span>┌──────────────────────────────────────────┐
│                  Browser                │
│   - Home Page                            │
│   - Room Page                            │
│   - iframe 摄像头                         │
│   - 聊天 UI                               │
│   - WebRTC 语音                           │
└──────────────────────────────────────────┘
                │
                ▼
┌──────────────────────────────────────────┐
│                 Vercel                  │
│  Next.js 前端 + Serverless 后端          │
│  - /api/best-camera                      │
│  - /api/create-room                      │
│  - Secrets (API Keys)                    │
└──────────────────────────────────────────┘
                │
                ▼
┌──────────────────────────────────────────┐
│                Supabase                 │
│  - Postgres (rooms / messages)           │
│  - Realtime (聊天)                        │
│  - Presence (在线人数)                    │
└──────────────────────────────────────────┘
                │
                ▼
┌──────────────────────────────────────────┐
│                 Daily                   │
│       WebRTC 多人语音房间               │
└──────────────────────────────────────────┘
</span></span></code></div></div></pre>

---

# ⭐ 5. 总结（一句话）

> **Sunset Earth V1 = Next.js（前端）+ Vercel（Serverless 后端）+ Supabase（实时聊天）+ Daily（语音）+ YouTube（摄像头源）。**

无服务器、轻量、低成本、3 天可上线。
