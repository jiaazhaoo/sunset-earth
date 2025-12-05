# 推荐算法架构分析

## 一、算法流程图

```
┌─────────────────────────────────────────────────────────────┐
│                    数据采集层 (每3小时)                        │
└─────────────────────────────────────────────────────────────┘
                              ↓
    ┌──────────────────────────────────────────────┐
    │  /api/weather-cache (with task lock)        │
    │  - 获取91个摄像头的天气数据                    │
    │  - 存储到 camera_weather_cache               │
    │  - 缓存日出/日落时间                          │
    └──────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   计算层 (每5分钟 + 链式触发)                   │
└─────────────────────────────────────────────────────────────┘
                              ↓
    ┌──────────────────────────────────────────────┐
    │  /api/compute-rankings (with task lock)      │
    │  - 等待 weather-cache 完成                    │
    │  - 检查摄像头可用性                           │
    │  - 调用 scoreCameraWeather 计算分数          │
    │  - 更新 camera_rankings 表                   │
    └──────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                     服务层 (实时查询)                          │
└─────────────────────────────────────────────────────────────┘
                              ↓
    ┌──────────────────────────────────────────────┐
    │  /api/best-camera                            │
    │  - 查询 available=true 的摄像头               │
    │  - 按 score 降序排列                          │
    │  - 排除用户已看过的摄像头                      │
    │  - 返回最佳推荐                               │
    └──────────────────────────────────────────────┘
                              ↓
                         用户观看
```

## 二、评分算法分析

### 2.1 核心公式

```
最终分数 = baseScore × weatherWeight × adjustedQuality

其中:
- baseScore = timeWeights[timeTier] (0-100)
- weatherWeight = WEATHER_WEIGHTS[weatherClass] (0.4-1.0)
- adjustedQuality = 0.4 + 0.6 × qualityScore (0.4-1.0)
```

### 2.2 时间层级 (Time Tier)

| Tier | Label | Base Score | 说明 |
|------|-------|-----------|------|
| 1 | sunset-primary / sunrise-primary | 100 | 黄金时段：日落前60分钟至日落后5分钟 / 日出前15分钟至日出后60分钟 |
| 2 | sunset-extended / sunrise-extended | 85 | 扩展时段：日落前90分钟至日落后10分钟 / 日出前30分钟至日出后90分钟 |
| 3 | clear-day | 65 | 白天晴朗 |
| 4 | city-skyline-night | 45 | 城市夜景（需要tag含"city skyline"且天气晴朗） |
| 5 | night | 20 | 普通夜晚 |

**特殊调整：**
- `sunsetDelayMinutes`: 延长日落后黄金时段（某些摄像头位置特殊）
- `sunriseAdvanceMinutes`: 提前日出前黄金时段

### 2.3 天气权重 (Weather Weight)

| Weather Class | Weight | WMO Code |
|--------------|--------|----------|
| clear | 1.0 | 0, 1 |
| partly-cloudy | 0.4 | 2 |
| light-snow | 0.7 | 71, 85 |
| other | 0.4 | 其他 |

### 2.4 质量评分 (Quality Score)

综合以下因素（标准化到0-1）：
- **能见度** (visibility): 20000m为满分，越高越好
- **湿度** (humidity): 0%为满分，越低越好
- **降雨量** (precipitation): 0mm为满分，越低越好
- **降雪量** (snowfall): 0cm为满分，越低越好
- **云层覆盖** (cloudcover): 0%为满分，越低越好

```
qualityScore = average(所有可用因素的标准化值)
adjustedQuality = 0.4 + 0.6 × qualityScore  // 最低40%，最高100%
```

### 2.5 评分示例

**场景1：日落黄金时段 + 晴天 + 完美天气**
```
tier = 1, baseScore = 100
weatherClass = "clear", weatherWeight = 1.0
qualityScore = 1.0, adjustedQuality = 1.0
最终分数 = 100 × 1.0 × 1.0 = 100
```

**场景2：日出扩展时段 + 多云 + 中等天气**
```
tier = 2, baseScore = 85
weatherClass = "partly-cloudy", weatherWeight = 0.4
qualityScore = 0.5, adjustedQuality = 0.7
最终分数 = 85 × 0.4 × 0.7 = 24
```

**场景3：白天晴朗 + 完美天气**
```
tier = 3, baseScore = 65
weatherClass = "clear", weatherWeight = 1.0
qualityScore = 1.0, adjustedQuality = 1.0
最终分数 = 65 × 1.0 × 1.0 = 65
```

## 三、鲁棒性分析

### ✅ 优点

#### 1. **多层缓存保护**
- **内存缓存** (`weatherCache` Map): 1小时TTL
- **数据库缓存** (`camera_weather_cache`): 持久化
- **降级策略**: 缓存过期2小时内仍可用，后台刷新

#### 2. **数据新鲜度控制**
- Rankings要求24小时内更新 (`computed_at >= now - 24h`)
- Weather数据每3小时刷新
- Rankings每5分钟更新（或链式触发）

#### 3. **错误处理完整**
```typescript
// 天气获取失败 → 重试2次
for (let attempt = 0; attempt < 2; attempt++) { ... }

// 摄像头不可用 → 仍然存储，标记 available=false
if (!availability.available) {
  await upsertRanking({ score: 0, available: false });
}

// 缺少天气数据 → 跳过但记录原因
if (!weather) {
  summary.skipped++;
  summary.details.push({ reason: "missing-weather-cache" });
}
```

#### 4. **任务锁机制** (新增)
- 防止竞态条件
- 自动超时清理（10分钟TTL）
- compute-rankings等待weather-cache完成

#### 5. **用户体验优化**
- localStorage追踪已看摄像头，避免重复
- rotationReset标记（看完所有可用摄像头）
- 实时availability检查（iframe加载失败时）

### ⚠️ 潜在问题

#### 1. **分数相同时顺序固定** ✅ 已识别
- **问题**: PostgreSQL不保证相同score的排序
- **影响**: 多个摄像头score=88时，总是返回相同的
- **建议**: 添加二级排序

```typescript
// 当前
.order("score", { ascending: false })

// 建议
.order("score", { ascending: false })
.order("distance_minutes", { ascending: true })  // 优先距离黄金时段更近的
```

#### 2. **天气数据覆盖不全**
- **问题**: Open-Meteo可能对某些地区数据不准确
- **缓解**: 使用降级策略，缺少数据时跳过而不是报错
- **建议**: 添加备用天气API（如OpenWeatherMap）

#### 3. **摄像头可用性检测延迟**
- **问题**: refresh-links每小时运行，摄像头可能突然下线
- **缓解**: 客户端实时检查（check-camera API）
- **建议**: 考虑用户反馈机制（"Report broken camera"）

#### 4. **时区处理复杂性**
- **问题**: 摄像头时区可能错误，导致日出日落时间不准
- **缓解**: 使用`tz-lookup`从经纬度推断时区
- **风险**: 数据库timezone字段可能与实际不符

#### 5. **缺少历史趋势分析**
- **当前**: 只看当前时刻的天气和时间
- **建议**: 考虑未来1-2小时的天气趋势
  - 例如：现在多云但1小时后转晴，可以提前推荐

## 四、闭环检查

### ✅ 完整的数据流闭环

```
1. 数据采集
   weather-cache → camera_weather_cache ✅

2. 数据计算
   compute-rankings → camera_rankings ✅

3. 数据服务
   best-camera → 用户 ✅

4. 数据更新
   refresh-links → link_available ✅
   weather-cache (每3h) → 重新开始 ✅
```

### ✅ 错误恢复闭环

```
1. 摄像头下线
   → refresh-links 检测 → link_available=false
   → compute-rankings 标记 available=false
   → best-camera 不返回此摄像头
   → 用户看不到坏摄像头 ✅

2. 摄像头恢复
   → refresh-links 检测 → link_available=true
   → compute-rankings 重新计算 → available=true
   → 用户可以看到恢复的摄像头 ✅

3. 天气API失败
   → 重试2次
   → 使用缓存数据（2小时内）
   → 后台异步刷新 ✅
```

### ✅ 状态同步闭环

```
1. 数据库状态
   camera_rankings.computed_at → 24小时新鲜度检查 ✅

2. 用户状态
   localStorage.seen → 避免重复推荐 ✅
   rotationReset → 看完所有摄像头后重置 ✅

3. 实时状态
   check-camera API → iframe错误时即时验证 ✅
```

## 五、改进建议

### 高优先级

1. **添加二级排序** ⭐⭐⭐
   ```typescript
   .order("score", { ascending: false })
   .order("distance_minutes", { ascending: true })
   ```

2. **统一处理缺少天气缓存** ⭐⭐⭐
   ```typescript
   if (!weather) {
     // 应该也更新rankings，标记原因
     await upsertRanking({
       cameraId: camera.id,
       score: 0,
       available: false,
       computedAt: now,
     });
   }
   ```

### 中优先级

3. **添加分数随机化** ⭐⭐
   - 对于相同分数的摄像头，加入小幅随机偏移（±2分）
   - 避免总是推荐相同的摄像头

4. **天气趋势预测** ⭐⭐
   - 利用hourly数据预测未来1-2小时
   - 提前推荐即将转晴的地点

5. **用户反馈机制** ⭐⭐
   - "This camera is broken" 按钮
   - 快速更新link_available状态

### 低优先级

6. **历史分数追踪** ⭐
   - 记录每次计算的分数到history表
   - 分析哪些摄像头最常获得高分

7. **AB测试框架** ⭐
   - 测试不同的评分权重
   - 收集用户观看时长数据优化算法

## 六、总结

### 整体评价：**优秀** (8.5/10)

**优点：**
✅ 算法设计合理，考虑了时间、天气、质量多个维度
✅ 缓存策略完善，有多层降级保护
✅ 错误处理全面，有完整的恢复机制
✅ 数据流闭环完整，状态同步及时
✅ 新增任务锁机制解决了竞态条件

**待改进：**
⚠️ 相同分数排序问题（已识别，易修复）
⚠️ 缺少天气缓存时的处理不一致（易修复）
⚠️ 缺少用户反馈机制
⚠️ 没有历史趋势分析

**总体建议：**
当前系统已经很健壮，主要需要修复两个小bug（二级排序 + 统一缺少天气缓存处理），其他都是锦上添花的优化。
