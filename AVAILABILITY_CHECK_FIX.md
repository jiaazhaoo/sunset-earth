# Availability Check Fix - YouTube Error Messages

## 问题发现

**症状**: 用户看到显示 "This live event is no longer available" 的摄像头

**根本原因**: YouTube有多种不可用错误消息，但我们的检测列表不完整

## 修复内容

### 1. 后端检测 (lib/availability.ts)

添加了新的错误消息到检测列表：

```typescript
const unavailablePhrases = [
  "This live stream recording is not available",  // ✅ 原有
  "This live event is no longer available",       // ✨ 新增
  "Video unavailable",                             // ✅ 原有
  "Private video",                                 // ✅ 原有
  "Playback on other websites has been disabled", // ✅ 原有
];
```

**检测时机**:
- `/api/refresh-links` cron job（每小时）
- `/api/compute-rankings` 计算可用性时

**效果**:
- 检测到这些消息时，标记 `available=false`
- 摄像头不会出现在推荐列表中

### 2. 前端检测 (components/camera-viewer.tsx)

同步更新前端iframe检测：

```typescript
const unavailablePhrases = [
  "This live stream recording is not available",
  "This live event is no longer available",  // ✨ 新增
  "Video unavailable",                        // ✨ 新增
  "Private video",                            // ✨ 新增
];
```

**检测时机**:
- iframe `onLoad` 事件（尝试读取iframe内容）
- 提供即时fallback，如果后端检测过时

**效果**:
- 立即触发 `onStreamError()`
- 自动跳转到下一个摄像头

## YouTube 错误消息类型

### 已识别的错误类型

| 错误消息 | 场景 | 状态 |
|---------|------|------|
| `This live stream recording is not available` | 直播录像被删除/私有 | ✅ 已检测 |
| `This live event is no longer available` | 直播活动已结束 | ✅ 已修复 |
| `Video unavailable` | 视频删除/地区限制 | ✅ 已检测 |
| `Private video` | 视频设为私有 | ✅ 已检测 |
| `Playback on other websites has been disabled` | 嵌入被禁用 | ✅ 已检测 |

### 可能的其他错误（待验证）

如果将来发现新的错误消息，添加到两个位置：
1. `lib/availability.ts` - 后端检测
2. `components/camera-viewer.tsx` - 前端检测

**常见的其他消息**:
- "This video is not available"
- "This video has been removed"
- "This video is no longer available because the YouTube account associated with this video has been terminated"
- "The uploader has not made this video available in your country"

## 多层防护机制

### 第1层：后端Cron检测（主要防线）

**频率**: 每小时一次
**工具**: `lib/availability.ts` → `isCameraAvailable()`
**结果**: 更新 `camera_rankings.available` 字段

```
/api/refresh-links (hourly)
  → isCameraAvailable(camera)
    → fetch embed URL
    → check HTML for error phrases
    → update camera_rankings.available = false
```

### 第2层：实时计算检测（辅助防线）

**频率**: 每5分钟或天气更新后
**工具**: `app/api/compute-rankings/route.ts`
**结果**: 重新验证可用性

```
/api/compute-rankings
  → isCameraAvailable(camera)
    → if unavailable: score=0, available=false
```

### 第3层：前端即时检测（最后防线）

**频率**: 每次加载摄像头
**工具**: `components/camera-viewer.tsx` iframe检测
**结果**: 立即跳转到下一个摄像头

```
<iframe onLoad={...}>
  → try to read iframe.contentDocument
    → if contains error phrase
      → trigger onStreamError()
        → load next camera
```

**注意**: 由于CORS限制，iframe内容读取可能失败，这就是为什么后端检测是主要防线。

## 为什么这个摄像头还能被看到？

### 可能的原因

1. **后端检测未及时运行**
   - refresh-links每小时运行
   - 如果直播刚结束，需要等到下一个小时

2. **Rankings数据过时**
   - 使用24小时内的rankings数据
   - 如果摄像头在过去24小时内是好的，仍会被展示

3. **iframe检测失败**
   - CORS限制阻止读取iframe内容
   - 前端检测无法生效

### 修复后的改进

✅ **后端检测更全面** - 现在能识别"This live event is no longer available"
✅ **前端检测更完整** - 添加更多错误消息匹配
✅ **双重保护** - 后端+前端都能捕获

## 验证步骤

### 1. 测试后端检测

```bash
# 手动触发availability检查
curl -X GET "https://your-domain.com/api/refresh-links" \
  -H "Authorization: Bearer $CRON_SECRET"
```

检查数据库：
```sql
SELECT camera_id, available, label
FROM camera_rankings
WHERE camera_id = 'CAMERA_ID_HERE';
```

应该看到 `available = false`

### 2. 测试前端检测

1. 访问网站并等待问题摄像头出现
2. 打开浏览器控制台
3. 应该看到自动跳转到下一个摄像头
4. 控制台不应有JavaScript错误

### 3. 端到端测试

1. 等待下一个小时的refresh-links运行
2. 检查数据库中问题摄像头的状态
3. 访问网站，确认不再看到该摄像头

## 监控建议

### 每周检查

```sql
-- 查找长期不可用的摄像头
SELECT
  camera_id,
  label,
  available,
  computed_at,
  EXTRACT(EPOCH FROM (NOW() - computed_at)) / 3600 AS hours_since_update
FROM camera_rankings
WHERE available = false
ORDER BY computed_at DESC;
```

### 错误日志监控

搜索Vercel日志中的关键词：
- "unavailable_text"
- "This live event is no longer available"
- "iframe inspection failed"

## 未来改进建议

### 短期（1-2周）

1. **添加用户反馈机制**
   ```typescript
   // "Report broken camera" 按钮
   <button onClick={() => reportBrokenCamera(camera.id)}>
     Report Issue
   </button>
   ```

2. **增加错误消息库**
   - 收集更多YouTube错误消息
   - 考虑使用正则表达式匹配

### 中期（1-2个月）

3. **缩短检测间隔**
   - refresh-links从1小时改为30分钟
   - 或添加用户触发的即时验证

4. **添加健康仪表板**
   - 显示所有摄像头的可用性状态
   - 允许手动标记/解除标记

### 长期（3-6个月）

5. **智能检测系统**
   - 使用ML识别新的错误模式
   - 自动学习和更新错误消息列表

6. **备用源系统**
   - 为每个地点维护多个摄像头源
   - 自动切换到备用源

---

**修复提交**: `12a73b6`
**部署时间**: 2024-12-05
**状态**: ✅ 已部署到生产环境
