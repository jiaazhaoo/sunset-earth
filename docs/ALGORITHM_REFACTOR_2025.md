# 推荐算法重构记录 (2025-12-18)

## 📋 目录
- [背景](#背景)
- [天气API调研](#天气api调研)
- [当前算法问题分析](#当前算法问题分析)
- [新算法设计](#新算法设计)
- [数据库结构调整](#数据库结构调整)
- [实施步骤](#实施步骤)
- [测试用例](#测试用例)

---

## 背景

### 问题描述
当前推荐算法存在严重准确性问题，无法正确匹配用户对摄像头观看场景的期望。

### 核心需求
1. **时间优先级**：
   - 优先白天（定义：日出前45分钟到日落后45分钟）
   - 最低优先级：睡眠时间（22:00-06:00本地时间）
   - 优先日出日落黄金窗口及蓝调时间

2. **摄像头特性**：
   - 观察视角越远（farpoint），能见度越重要
   - 城市天际线在晴朗夜晚优先级较高
   - 蓝调时间不怎么被云的影响

3. **天气容忍度**：
   - 不同类型摄像头对天气的容忍度不同
   - 需要区分"小雪"和"大雪"、"小雨"和"大雨"
   - 晴天为普适最优条件

---

## 天气API调研

### Open-Meteo API 数据结构

**请求参数** (lib/weather.ts:197-206):
```typescript
{
  latitude: number,
  longitude: number,
  hourly: "weathercode,cloudcover,relativehumidity_2m,visibility,precipitation,snowfall",
  daily: "sunrise,sunset",
  timezone: "UTC",
  forecast_days: "2",
  current_weather: "true"
}
```

**返回数据**:
```typescript
type OpenMeteoResponse = {
  latitude: number;
  longitude: number;
  timezone: string;
  utc_offset_seconds: number;

  // 当前天气
  current_weather?: {
    time: string;           // ISO 8601 时间戳
    weathercode: number;    // WMO天气代码 (0-99)
    is_day?: number;        // 1=白天, 0=夜晚
  };

  // 每小时预报
  hourly?: {
    time: string[];                  // 每小时时间戳数组
    weathercode: number[];           // WMO天气代码 (0-99)
    cloudcover: number[];            // 云量百分比 (0-100)
    relativehumidity_2m: number[];   // 相对湿度 (0-100)
    visibility: number[];            // 能见度（米）
    precipitation: number[];         // 降水量（毫米）
    snowfall: number[];              // 降雪量（厘米）
  };

  // 每日数据
  daily?: {
    time: string[];       // 日期数组
    sunrise: string[];    // 日出时间（ISO 8601）
    sunset: string[];     // 日落时间（ISO 8601）
  };
};
```

### WMO Weather Code 映射表

根据代码中的 `classifyWeather` 函数 (lib/client-ranking.ts:382-427):

| Code | 分类 | 描述 |
|------|------|------|
| 0, 1 | `clear` | 晴天 |
| 2 | `partly-cloudy` | 部分多云 |
| 3 | `cloudy` | 多云 |
| 45, 48 | `fog` | 雾 |
| 51, 53, 55 | `drizzle` | 毛毛雨 |
| 56, 57 | `freezing-rain` | 冻雨 |
| 61, 63, 65, 80, 81, 82 | `rain` | 降雨 |
| 66, 67 | `freezing-rain` | 冻雨 |
| 71, 73, 75, 77 | `snow` | 降雪 |
| 85, 86 | `snow-showers` | 阵雪 |
| 95 | `thunderstorm` | 雷暴 |
| 96, 99 | `thunderstorm-hail` | 雷暴+冰雹 |

### 天气细分需求

为了实现用户需求中的"小雪"、"小雨"区分，我们需要结合：
- **weathercode**: 判断天气类型
- **precipitation**: 降水量（mm）→ 区分小雨/中雨/大雨
- **snowfall**: 降雪量（cm）→ 区分小雪/大雪

**建议阈值**:
```typescript
// 降雨分级
precipitation < 0.5mm  → light-rain（小雨）
0.5mm ≤ precipitation < 2mm → moderate-rain（中雨）
precipitation ≥ 2mm → heavy-rain（大雨）

// 降雪分级
snowfall < 0.5cm → light-snow（小雪）
snowfall ≥ 0.5cm → heavy-snow（大雪）
```

---

## 当前算法问题分析

### 🔴 问题1: 白天定义错误

**需求**: 白天 = 日出前45分钟 到 日落后45分钟
**当前实现**: 白天 = 严格的日出到日落之间

**代码位置**: `lib/client-ranking.ts:746-766`

```typescript
// ❌ 当前错误逻辑
function determineDaytime(weather: OpenMeteoResponse, now: Date) {
  // ...
  const start = sunrise.getTime();
  const end = sunset.getTime();
  if (start <= nowMs && nowMs <= end) {  // 仅日出到日落
    return true;
  }
}
```

**影响**: 日出前45分钟和日落后45分钟被错误标记为"夜晚"，导致大量优质时段得分过低。

---

### 🔴 问题2: 天气权重过于粗糙

**需求**:
- 蓝调时间天气影响极小
- 不同类型摄像头天气容忍度不同
- 需要区分小雪/大雪、小雨/大雨

**当前实现**:
- 所有场景使用固定天气权重
- 未区分降水/降雪强度

**代码位置**: `lib/client-ranking.ts:25-37`

```typescript
// ❌ 固定权重，未考虑场景差异
const WEATHER_WEIGHTS: Record<WeatherClass, number> = {
  clear: 1,
  "partly-cloudy": 0.85,
  snow: 0.65,  // 未区分小雪和大雪
  rain: 0.45,  // 未区分小雨和大雨
  // ...
};
```

---

### 🔴 问题3: 能见度权重不足

**需求**: "摄像头观察视角越远，能见度越重要"

**当前实现**: 能见度仅作为5个气象指标之一，权重为1/5

**代码位置**: `lib/client-ranking.ts:534-581`

```typescript
// ❌ 所有指标平权，未针对farpoint加权
function buildQualityScore(inputs: QualityInputs): number {
  const factors: number[] = [];
  // visibility, humidity, precipitation, snowfall, cloudcover
  // 每个因素权重相同（1/5）
}
```

---

### 🔴 问题4: 睡眠时间惩罚不足

**需求**:
- Street/Railway: "睡眠时间完全没法看"
- Ski Resort: "睡眠时间没法看"

**当前实现**: 睡眠时间惩罚系数仅0.1

**代码位置**: `lib/client-ranking.ts:327-339`

```typescript
// ❌ 惩罚力度不够
if (isLocalSleepTime(timezone, now)) {
  weatherWeight = 0.1; // 应该接近0
}
```

---

### 🔴 问题5: 缺少摄像头细分类型

**需求**: 170个摄像头分为14种细分类型，包括：
- Aurora（极光）
- Mountain + Farpoint（远景山脉）
- Ski Resort（滑雪场）
- Cultural Landmark（历史建筑）
- Nature + Farpoint（远景自然）
- Railway Station（火车站）
- Street（街景）
- Ocean + Farpoint（远景海洋）
- City Skyline + Farpoint（远景城市天际线）
- Beach（海滩）
- Harbor（港口）
- Railway View（火车第一视角）
- Village + Farpoint（远景村庄）
- Airport + Farpoint（远景机场）

**当前实现**: 仅识别8种粗糙类型

**代码位置**: `lib/client-ranking.ts:117-145`

---

### 🔴 问题6: 黄金时刻定义不完整

**需求**:
- 黄金时刻优先级最高
- 蓝调时间次高
- 蓝调时间不怎么被云影响

**当前实现**:
- ✅ 黄金时刻定义正确（日落前30分钟 → 日落后30分钟）
- ✅ 蓝调时刻定义正确（日落后60-90分钟）
- ❌ 蓝调时刻天气权重仅0.95（应接近1.0）

**代码位置**: `lib/client-ranking.ts:290-293`

```typescript
// ❌ 蓝调时刻天气影响应该更小
if (timeTier.label === "blue-hour-sunset" || timeTier.label === "blue-hour-sunrise") {
  weatherWeight = weatherClass === "clear" ? 1 : 0.95;  // 应该0.98+
}
```

---

## 新算法设计

### 核心公式

```
最终分数 = 时间基础分 × 天气适配度 × 质量分数 × 特殊惩罚因子
排序规则 = 分数优先 + Tier美学打破平局
```

**组成部分**:
1. **时间基础分** (0-100): 基于时间窗口的优先级
2. **天气适配度** (0-1): 根据摄像头类型和天气动态调整
3. **质量分数** (0-1): 气象指标综合评分（farpoint加权能见度）
4. **特殊惩罚因子** (0-1): 睡眠时间、极光白天等特殊场景
5. **Tier美学排序** (t0>t1>t2>t3): 当分数接近(≤1分)时，tier打破平局

### 时间分层系统（7层）

| Tier | 标签 | 基础分数 | 适用场景 |
|------|------|---------|---------|
| 1 | Golden Hour Core | 100 | 日出日落±30分钟 |
| 2 | Blue Hour | 95 | 日落后60-90分钟 / 日出前90-60分钟 |
| 3 | Extended Golden Hour | 85 | 黄金时刻前后30-60分钟 |
| 4 | Daytime | 70 | 日出前45分钟到日落后45分钟 |
| 5 | Clear Night Skyline | 60 | 城市天际线晴朗夜晚 |
| 6 | Night | 30 | 普通夜晚 |
| 7 | Sleep Time | 5 | 本地22:00-06:00（如果摄像头不支持夜间观看） |

### 天气适配度矩阵

**原则**:
- 黄金时刻: partly-cloudy影响小（0.9）
- 蓝调时刻: 天气几乎无影响（0.98）
- Street/Railway: 容忍小雨、小雪（1.0）
- City Skyline: 需要晴天，雨天严重降分（0.3）
- Mountain Farpoint: 依赖能见度，partly-cloudy可接受（0.85）
- Aurora: 只接受晴天（非晴天0.2）

**天气细分**:
```typescript
type WeatherClassDetailed =
  | "clear"
  | "partly-cloudy"
  | "cloudy"
  | "fog"
  | "light-rain"      // NEW: precipitation < 0.5mm
  | "moderate-rain"   // NEW: 0.5mm ≤ precipitation < 2mm
  | "heavy-rain"      // NEW: precipitation ≥ 2mm
  | "freezing-rain"
  | "light-snow"      // NEW: snowfall < 0.5cm
  | "heavy-snow"      // NEW: snowfall ≥ 0.5cm
  | "snow-showers"
  | "thunderstorm"
  | "thunderstorm-hail";
```

### 质量分数计算

**Farpoint摄像头** (能见度权重70%):
```typescript
qualityScore = 0.7 × visibility_score + 0.3 × other_avg
```

**普通摄像头** (5指标平权):
```typescript
qualityScore = avg(visibility, humidity, precipitation, snowfall, cloudcover)
```

### 特殊惩罚因子

| 场景 | 惩罚因子 | 说明 |
|------|---------|------|
| Street + 睡眠时间 | 0.05 | "完全没法看" |
| Ski Resort + 睡眠时间 | 0.05 | "没法看" |
| Aurora + 白天 | 0 | 极光只能夜晚观看 |
| Mountain/Beach/Nature + 夜晚 | 0.1 | 自然景观夜晚价值低 |
| Cultural Landmark + 夜晚 | 0.3 | 历史建筑夜晚可看，但不如白天 |

### Tier美学排序规则

**设计理念**: Tier代表摄像头画面的主观美学评价，在算法客观评分接近时发挥作用。

**排序逻辑**:
```
1. 分数差距 > 1分：完全按分数排序（天气和时间优先）
   示例: 75分的t2摄像头 > 70分的t0摄像头

2. 分数接近（差距 ≤ 1分）：tier打破平局（美学优先）
   示例: 71分的t0摄像头 > 71分的t2摄像头

3. 分数完全相同：按距离黄金时刻 → 随机
```

**Tier等级定义**:
- **t0** (26个): 特别美的摄像头 - 如台北101、时代广场、富士山顶
- **t1** (52个): 很好看的摄像头 - 高质量城市天际线、山景
- **t2** (87个): 还行的摄像头 - 普通街景、小镇风景
- **t3** (1个): 一般的摄像头 - 质量或视角一般

**代码实现** (`lib/client-ranking-v2.ts:692-717`):
```typescript
return itemsWithRandom.sort((a, b) => {
  // 1. 分数差>1分：直接按分数
  const scoreDiff = b.evaluation.score - a.evaluation.score;
  if (Math.abs(scoreDiff) > 1) {
    return scoreDiff;
  }

  // 2. 分数接近：tier打破平局
  if (Math.abs(scoreDiff) <= 1 && scoreDiff !== 0) {
    const tierOrder = { 't0': 0, 't1': 1, 't2': 2, 't3': 3 };
    const tierA = a.metadata?.tier ? tierOrder[a.metadata.tier] : 99;
    const tierB = b.metadata?.tier ? tierOrder[b.metadata.tier] : 99;
    if (tierA !== tierB) {
      return tierA - tierB;  // t0 > t1 > t2 > t3
    }
  }

  // 3. 继续其他排序...
});
```

**为什么不直接加分？**
- ❌ **方案A (加成3%)**: 可能导致天气差的美景排在天气好的普通景之前
- ✅ **方案B (打破平局)**: 保持算法客观性，仅在纠结时考虑美学

**示例场景**:
```
场景1: 台北阴天75分(t0) vs 东京晴天76分(t2)
结果: 东京优先（天气更重要）

场景2: 台北晴天71分(t0) vs 某小镇晴天71分(t2)
结果: 台北优先（条件相同时美学取胜）
```

---

## 数据库结构调整

### 新增字段: camera_ytb.camera_metadata

**类型**: `JSONB`

**结构**:
```typescript
type CameraMetadata = {
  // 主要类型
  primaryType:
    | 'aurora'
    | 'mountain'
    | 'ski-resort'
    | 'cultural-landmark'
    | 'nature'
    | 'railway-station'
    | 'street'
    | 'ocean'
    | 'city-skyline'
    | 'beach'
    | 'harbor'
    | 'railway-view'
    | 'village'
    | 'airport';

  // 视角特性
  isFarpoint: boolean;        // 是否远景（影响能见度权重）

  // 美学分级（主观评分）
  // t0: 特别美 | t1: 很好看 | t2: 还行 | t3: 一般
  // 作用: 当算法评分接近时(差距≤1分)，tier用于打破平局，推荐更美的摄像头
  tier: 't0' | 't1' | 't2' | 't3';

  // 分辨率
  resolution: '720p' | '1080p' | '高1080p' | '4k';

  // 观看时间限制
  viewingTime: {
    dayOnly: boolean;         // 仅白天可看
    nightOnly: boolean;       // 仅夜晚可看 (如极光)
    noSleepTime: boolean;     // 睡眠时间不可看 (如街景、火车站)
    anytime: boolean;         // 任何时间可看 (如城市天际线)
  };

  // 天气容忍度
  weatherTolerance: {
    clear: boolean;           // 接受晴天
    partlyCloudy: boolean;    // 接受部分多云
    lightRain: boolean;       // 接受小雨
    lightSnow: boolean;       // 接受小雪
  };

  // 事件导向 (暂未实现)
  isEventDriven?: boolean;    // 如极光爆发、火车发车
};
```

### SQL迁移脚本

```sql
-- 添加新字段
ALTER TABLE camera_ytb
ADD COLUMN IF NOT EXISTS camera_metadata JSONB;

-- 创建索引以加速查询
CREATE INDEX IF NOT EXISTS idx_camera_metadata_primary_type
ON camera_ytb ((camera_metadata->>'primaryType'));

CREATE INDEX IF NOT EXISTS idx_camera_metadata_farpoint
ON camera_ytb ((camera_metadata->>'isFarpoint'));

-- 示例数据插入 (Camera #1 - Aurora)
UPDATE camera_ytb SET camera_metadata = '{
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
}'::jsonb WHERE camera_id = 1;
```

---

## 实施步骤

### Phase 1: 数据准备 (优先级: 🔥 P0)

**任务**:
1. ✅ 调研天气API数据结构
2. ⏳ 根据170条规则生成摄像头元数据映射
3. ⏳ 执行数据库迁移，添加 `camera_metadata` 字段
4. ⏳ 批量更新所有摄像头的元数据

**输出**:
- `scripts/generate_camera_metadata.ts` - 元数据生成脚本
- `scripts/update_camera_metadata.sql` - 批量更新SQL

---

### Phase 2: 算法重写 (优先级: 🔥 P0)

**任务**:
1. ⏳ 修复白天定义（日出前45分钟到日落后45分钟）
2. ⏳ 实现天气细分（light-snow vs heavy-snow）
3. ⏳ 实现Farpoint能见度加权
4. ⏳ 增强睡眠时间惩罚（0.1 → 0.05）
5. ⏳ 调整蓝调时刻天气权重（0.95 → 0.98）
6. ⏳ 实现基于元数据的动态评分

**输出**:
- 更新 `lib/client-ranking.ts`
- 新增类型定义
- 单元测试

---

### Phase 3: 测试验证 (优先级: 🎯 P1)

**任务**:
1. ⏳ 创建测试用例（见下方）
2. ⏳ 对比新旧算法输出
3. ⏳ A/B测试框架搭建

**输出**:
- `tests/ranking-algorithm.test.ts`
- 测试报告

---

### Phase 4: 上线与监控 (优先级: 📈 P2)

**任务**:
1. ⏳ 灰度发布（10% → 50% → 100%）
2. ⏳ 监控用户反馈指标
3. ⏳ 根据数据调优权重参数

---

## 测试用例

### Case 1: Aurora极光（Camera #1）

**元数据**:
```json
{
  "primaryType": "aurora",
  "nightOnly": true,
  "weatherTolerance": { "clear": true }
}
```

**测试场景1**: 晴朗夜晚
```typescript
输入:
- weatherClass: "clear"
- isDaytime: false
- localTime: 23:00
- visibility: 18000m

预期输出:
- score: 55-65 (Clear Night Skyline tier + aurora bonus)
- label: "night"
```

**测试场景2**: 白天
```typescript
输入:
- isDaytime: true

预期输出:
- score: 0 (极光白天直接归零)
```

---

### Case 2: Mount Fuji远景（Camera #2）

**元数据**:
```json
{
  "primaryType": "mountain",
  "isFarpoint": true,
  "dayOnly": true,
  "weatherTolerance": { "clear": true, "partlyCloudy": true, "lightRain": true }
}
```

**测试场景1**: 日出黄金时刻 + partly cloudy + 能见度15km
```typescript
输入:
- timeTier: Golden Hour (sunrise-primary)
- weatherClass: "partly-cloudy"
- visibility: 15000m
- cloudcover: 50

预期输出:
- score: 75-85
- baseScore: 100 (黄金时刻)
- weatherWeight: 0.9 (partly cloudy对黄金时刻影响小)
- qualityScore: 0.7 × (15000/20000) + 0.3 × other ≈ 0.65
- finalScore: 100 × 0.9 × 0.65 ≈ 58.5 → 调整后75-85
```

**测试场景2**: 夜晚
```typescript
输入:
- isDaytime: false

预期输出:
- score: < 10 (dayOnly摄像头夜晚严重降分)
```

---

### Case 3: Times Square街景（Camera #7）

**元数据**:
```json
{
  "primaryType": "street",
  "noSleepTime": true,
  "weatherTolerance": { "clear": true, "partlyCloudy": true, "lightRain": true }
}
```

**测试场景1**: 白天 + partly cloudy + 本地时间14:00
```typescript
输入:
- timeTier: Daytime
- weatherClass: "partly-cloudy"
- localTime: 14:00

预期输出:
- score: 65-75
- baseScore: 70 (Daytime)
- weatherWeight: 1.0 (街景对天气宽容)
- sleepTimePenalty: 1.0 (非睡眠时间)
- finalScore: 70 × 1.0 × quality × 1.0
```

**测试场景2**: 睡眠时间（本地23:00）
```typescript
输入:
- localTime: 23:00 (纽约本地时间)
- weatherClass: "clear"

预期输出:
- score: < 5
- sleepTimePenalty: 0.05 ("完全没法看")
- finalScore: baseScore × 0.05 ≈ 3.5
```

---

### Case 4: Taipei Skyline（Camera #11）

**元数据**:
```json
{
  "primaryType": "city-skyline",
  "isFarpoint": true,
  "anytime": true,
  "weatherTolerance": { "clear": true, "partlyCloudy": true }
}
```

**测试场景1**: 日落黄金时刻 + clear
```typescript
输入:
- timeTier: Golden Hour (sunset-primary)
- weatherClass: "clear"
- visibility: 18000m

预期输出:
- score: 85-95
- baseScore: 100
- weatherWeight: 1.0
- qualityScore: ≈ 0.9 (farpoint高能见度)
```

**测试场景2**: 晴朗夜晚
```typescript
输入:
- timeTier: Night
- weatherClass: "clear"
- visibility: 18000m
- isDaytime: false

预期输出:
- score: 60-70
- baseScore: 60 (Clear Night Skyline tier)
- citySkylineBonus: 1.2 (城市天际线夜晚加成)
- finalScore: 60 × 1.2 × quality ≈ 65
```

---

## 附录

### 170个摄像头元数据总结

**统计**:
- Aurora: 3个 (Camera #1, #25, #108)
- Mountain Farpoint: 约15个
- Ski Resort: 约12个
- Street: 约25个
- City Skyline: 约20个
- Beach: 约15个
- Harbor: 约10个
- Cultural Landmark: 约10个
- Nature: 约15个
- Railway: 约10个
- Village: 约5个
- Airport: 约5个
- 其他: 约15个

**Farpoint比例**: 约40个摄像头标记为farpoint

**时间限制分布**:
- dayOnly: 约100个
- nightOnly: 3个 (仅Aurora)
- noSleepTime: 约30个
- anytime: 约15个

**Tier分布**:
- t0: 约25个
- t1: 约40个
- t2: 约90个
- t3: 约5个

---

## 变更日志

### 2025-12-18

**Phase 1: 调研与设计** ✅
- ✅ 完成天气API调研
- ✅ 分析当前算法6大问题
- ✅ 设计新算法架构
- ✅ 定义数据库结构

**Phase 2: 数据准备** ✅
- ✅ 生成170个摄像头元数据映射（156个有效）
- ✅ 创建SQL迁移脚本
  - `scripts/migrations/001_add_camera_metadata.sql` - 添加字段和索引
  - `scripts/migrations/002_update_all_camera_metadata.sql` - 批量更新元数据
  - `scripts/migrations/README.md` - 迁移指南

**Phase 3: 算法重写** ✅
- ✅ 创建类型定义 (`lib/camera-metadata-types.ts`)
- ✅ 实现天气细分逻辑 (`lib/weather-classification.ts`)
- ✅ 重写核心评分算法 (`lib/client-ranking-v2.ts`)

**关键改进**:
1. ✅ 修正白天定义：日出前45分钟到日落后45分钟
2. ✅ 天气细分：区分light-snow/heavy-snow, light-rain/moderate-rain/heavy-rain
3. ✅ Farpoint能见度加权：70%权重
4. ✅ 睡眠时间严格惩罚：0.05系数
5. ✅ 蓝调时刻天气宽容：0.98系数
6. ✅ 基于camera_metadata的动态评分

**待完成** ⏳:
- ⏳ 创建测试用例
- ⏳ 集成到现有系统
- ⏳ A/B测试验证

---

## 参考资料

- [Open-Meteo API文档](https://open-meteo.com/en/docs)
- [WMO Weather Code定义](https://www.nodc.noaa.gov/archive/arc0021/0002199/1.1/data/0-data/HTML/WMO-CODE/WMO4677.HTM)
- 原排名算法文档: `docs/development/RANKING_ALGORITHM.md`
- 算法分析文档: `docs/development/ALGORITHM_ANALYSIS.md`
