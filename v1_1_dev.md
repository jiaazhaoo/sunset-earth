# 🌅 Sunset Earth — V1.1 Notes

用于在开发过程中记录新增的技术细节、表结构和实现约定。下面补充了 `rooms` 表的最终字段定义，确保与 Supabase 中的 schema 同步。

## 🧱 rooms 表（Supabase）

| 字段名             | 类型          | 默认值              | 说明 |
| ------------------ | ------------- | ------------------- | ---- |
| `room_id`          | `uuid`        | `gen_random_uuid()` | 房间唯一 ID（URL 使用 `/room/{room_id}`） |
| `camera_id`        | `text`        | —                   | 对应 `camera_ytb.camera_id`；房间创建时记录所选摄像头 |
| `room_start_time`  | `timestamptz` | `now()`             | 房间创建时间，使用 `timestamptz` 自动保存 UTC 并可换算任意时区 |
| `room_end_time`    | `timestamptz` | `now()`             | 最近活跃时间，后续进入房间/聊天时更新，用于清理长期空房 |
| `room_timezone`    | `text`        | —                   | 记录房间参考的时区，推荐写摄像头所在时区（IANA 名称，如 `America/Los_Angeles`） |
| `room_type`        | `text`        | `'public'`          | 房间类型，预留值：`public`（全民可见）、`private`（需分享链接）；后续可改为 enum |
| `voice_meeting_id` | `text`        | —                   | Cloudflare RealtimeKit Meeting ID，对应语音/聊天所用会议；在 Cloudflare 上创建后写入 |
| `is_close`         | `boolean`     | `false`             | 房间是否已关闭；被判定无参与者 15 分钟后置 `true` 并阻止再次访问 |

> **为什么使用 `timestamptz`？** Supabase/Postgres 中 `timestamptz` 自动按 UTC 存储并带时区语义，读取到应用时可根据 `room_timezone` 或客户端本地时间做转换，不必手动换算。

### 建表 SQL（可直接在 Supabase SQL Editor 执行）

```sql
create table if not exists public.rooms (
  room_id uuid primary key default gen_random_uuid(),
  camera_id text not null,
  room_start_time timestamptz not null default now(),
  room_end_time timestamptz not null default now(),
  room_timezone text,
  room_type text not null default 'public',
  voice_meeting_id text,
  is_close boolean not null default false
);

create index if not exists rooms_camera_id_idx on public.rooms (camera_id);
```

如需在应用里更新 `room_end_time`，后续可以通过 `rpc` 或简单的 `update` API 完成。`room_type` 目前保持文本字段，方便快速迭代，未来也可以迁移为 `enum`.

> 已经创建的旧表，可执行 `alter table public.rooms add column if not exists voice_meeting_id text;` 来补齐列。

---

## ✅ 开发进度记录

| 时间/节点 | 内容 |
| -------- | ---- |
| 1. Supabase 摄像头 → Next.js | `lib/cameras.ts` 封装 Supabase 查询，`/api/cameras` 和 `/api/best-camera` 接口打通，主页 iframe 可随机切换摄像头 |
| 2. Rooms 表建模 | 采用 `room_id/camera_id/room_start_time/room_end_time/room_timezone/room_type` 字段，全部使用 `timestamptz`，文档即本页所述 |
| 3. Rooms API helper | `lib/rooms.ts` 新增 `createRoom` 封装，统一插入字段/默认值，API Route 可以直接调用 |
| 4. `/api/create-room` | `POST /api/create-room` 接收 `cameraId/timezone` 并调用 `createRoom`，返回 `{ roomId }`，供首页跳转 |
| 5. Home 按钮联动 | `CameraViewer` 中增加房间创建按钮，调用 API 后跳转 `/room/{roomId}?camera={cameraId}`；loading/error 状态已实现 |
| 6. Rooms 查询封装 | `lib/rooms.ts` 新增 `getRoom(roomId)`，供 Room 页面验证房间存在及读取 camera_id |
| 7. Room 页面骨架 | `app/room/[roomId]/page.tsx` 落地：左侧摄像头 iframe + 功能说明，右侧聊天室占位，未找到房间时 `notFound()` |
| 8. Room params Promise 适配 | React 19 / Next 16 中动态路由 `params/searchParams` 以 Promise 形式注入，页面已改为 `await params` 后再取 `roomId` |
| 9. 分享功能 | Room 页顶部引入 `ShareRoomLink`（复制链接 + 分享到 X），自动根据请求 Host/协议生成分享 URL |
| 10. Headers Promise 适配 | `headers()` 在 Next.js 16 中也是 Promise，需要 `await headers()` 再调用 `.get()`，已在 room 页面修复 |
| 11. 语音 & 聊天（Cloudflare Realtime） | `.env` 需 `CLOUDFLARE_BASIC_AUTH`（整段 Basic 头）+ `CLOUDFLARE_REALTIME_PRESET`；`lib/cloudflareRealtime.ts` 调用 `https://api.realtime.cloudflare.com/v2` 创建 meeting/participant，React 端通过 `RealtimeSidebar` 统一拉起会议，`RoomVoicePanel` 控制语音，`RtkChat` 提供聊天 UI |
| 12. 浏览器提醒优化 | `RoomVoicePanel` 退出语音时除 `disableAudio()` 外，会 `stop()` 掉当前 `rawAudioTrack`，退出后浏览器不再提示占用麦克风 |
| 13. 主题切换 & UI 统一 | 页面新增 `ThemeToggle`，可在亮/暗/跟随之间手动切换；`RtkChat` 自定义了浅色主题变量，暗色模式下亦可保持统一风格 |
| 14. 摄像头优选 + 轮询记忆 | `/api/best-camera` 接入 Open-Meteo，按“晴天+日落/日出窗口”打分，若标签包含 `City Skyline` 则插入一档优先级；前端通过本地存储记录已观看摄像头，切换按钮会优先播放未看过的高优先级摄像头，全部看完后自动轮回 |
| 15. Live 自动修复 | 新增 `/api/refresh-camera`：当 iframe 提示直播不可用时，前端会先尝试调用该接口，用 `host_link` 所指频道里最相近（相似度 ≥ 0.75）的直播替换数据库的链接，并把 `link_available` 置为 true；若 3 小时内尝试失败则调用 `/api/camera-availability` 把 `link_available` 标记为 false，下一次再触发 |
| 16. 每小时巡检（Cron） | 新增 `/api/refresh-links`（供 Vercel Cron 调用）：每小时拉取所有摄像头，利用 `isCameraAvailable` 检查流是否可用，自动更新 `link_available`，并对不可用的摄像头调用和 `/api/refresh-camera` 相同的频道刷新逻辑；确保黑名单会自行恢复，同时复用 Cloudflare Realtime API 定期扫描房间，如某个房间已运行 15 分钟且 `voice_meeting_id` 不再有参与者，则把 `is_close` 置为 `true` 并把 `room_end_time` 递交关闭时间，页面访问时提示“日落已经结束”而不是直接 404 |
| 17. TODO | Presence（在线人数）与消息存储、历史回放 |

### Cloudflare RealtimeKit 集成备忘（语音 + 聊天）

1. 在 Cloudflare RealtimeKit 控制台创建 **Meeting & preset**，复制 Basic Auth（`Authorization: Basic ...`）和 preset 名称。`.env.local` 中配置：
   ```
   CLOUDFLARE_BASIC_AUTH=Basic xxx   # 官方面板中直接给出的值
   CLOUDFLARE_REALTIME_PRESET=<Preset name，比如 group_call_host>
   ```
2. `lib/cloudflareRealtime.ts` 使用 REST v2 (`https://api.realtime.cloudflare.com/v2/meetings`) + Basic Auth 创建 meeting / participant token。
3. `/api/create-room` 在写入 Supabase 前先创建 Cloudflare meeting 并存到 `voice_meeting_id`；`/api/realtime-token` 会在旧房间缺字段时自动补建。
4. 前端 `RealtimeSidebar` 使用 `@cloudflare/realtimekit-react` 的 `useRealtimeKitClient` 创建会议实例，`RealtimeKitProvider` 将 meeting 传递给 `RoomVoicePanel` 和 `RtkChat`。
5. 聊天 UI 通过 `@cloudflare/realtimekit-react-ui` 的 `RtkChat` 实现，配套挂载 `RtkParticipantsAudio`、`RtkNotifications`、`RtkDialogManager` 以获得完整体验。
6. 语音仍由 `RoomVoicePanel` 控制 `meeting.self.enableAudio()` / `disableAudio()`，并在退出时 `stop()` 麦克风 Track，按钮状态由 Realtime 连接状态驱动。
