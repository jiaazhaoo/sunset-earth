# Camera Pool Assignment ML Training Plan

## 目标 (Objective)

用机器学习模型替代当前的规则基础 `assignToPool()` 函数，以减少规则维护复杂度，同时提高分配准确性。

## 背景 (Background)

### 当前系统
- 5个池子 (Pool 1-5)，Pool 1-4 展示，Pool 5 隐藏
- 基于规则的 `assignToPool()` 函数，考虑：
  - 分数 (score)
  - 标签 (label: sunset-primary, city-skyline-night, etc.)
  - 天气类别 (weatherClass: clear, partly-cloudy, other)
  - 摄像头标签 (tags: City Skyline, Street Scene, Ski Resort, etc.)
  - 是否白天 (isDaytime)

### 问题
- 规则越来越复杂（天气抗性、夜景特殊处理、动态阈值等）
- 边界情况需要频繁调整
- 难以维护和扩展

### 解决方案
使用决策树/XGBoost模型学习pool分配模式

---

## Phase 1: 数据收集 (Data Collection)

### 1.1 导出当前规则分配结果

**目标**: 生成初始训练数据集

**实现脚本**: `scripts/export_training_data.ts`

```typescript
import { fetchAvailableRankings } from "@/lib/rankings";
import { getCameraById, getCameraTagsMap } from "@/lib/cameras";
import { assignToPool } from "@/lib/camera-pools";
import type { CameraEvaluation } from "@/lib/client-ranking";
import { createWriteStream } from 'fs';

async function exportTrainingData() {
  // 获取所有ranking数据
  const rankingResult = await fetchAvailableRankings({
    limit: 1000,
    freshnessMinutes: 24 * 60,
  });

  const cameraIds = rankingResult.rows.map(row => row.camera_id);
  const cameraTagsMap = await getCameraTagsMap(cameraIds);

  const csvStream = createWriteStream('training_data_initial.csv');
  csvStream.write('camera_id,score,label,weather_class,is_daytime,tags,pool_id,source,timestamp\n');

  for (const row of rankingResult.rows) {
    const evaluation: CameraEvaluation = {
      score: row.score,
      label: row.label as CameraEvaluation["label"],
      isClear: row.is_clear ?? false,
      isDaytime: null,
      weatherClass: row.weather_class as CameraEvaluation["weatherClass"],
      distanceMinutes: row.distance_minutes ?? undefined,
    };

    const tags = cameraTagsMap.get(row.camera_id);
    const poolId = assignToPool(evaluation, tags);

    const tagsStr = tags?.join('|') || '';
    csvStream.write(
      `${row.camera_id},${row.score},${row.label},${row.weather_class},${row.is_daytime},${tagsStr},${poolId},rule,${new Date().toISOString()}\n`
    );
  }

  csvStream.end();
  console.log('Training data exported to training_data_initial.csv');
}

exportTrainingData();
```

**运行**: `npx tsx scripts/export_training_data.ts`

**输出**: `training_data_initial.csv` (~1000行)

### 1.2 手动标注工具 (Manual Annotation Tool)

**目标**: 快速标注边界案例和错误分配

**实现**: 创建简单的网页界面 `app/dev/annotate/page.tsx`

功能:
- 显示摄像头信息 (ID, score, label, weather, tags)
- 显示当前pool分配 (规则生成)
- 提供下拉框选择正确的pool (1-5)
- 保存到 `training_data_manual.csv`
- 显示进度 (已标注/总数)

**数据格式**:
```csv
camera_id,score,label,weather_class,is_daytime,tags,pool_id,source,timestamp,annotator
62,39,city-skyline-night,clear,false,City Skyline|Harbor,3,manual,2025-12-14T10:30:00Z,user
53,39,city-skyline-night,clear,false,City Skyline,3,manual,2025-12-14T10:31:00Z,user
```

### 1.3 数据合并

**脚本**: `scripts/merge_training_data.py`

```python
import pandas as pd

# 读取两个数据源
rule_data = pd.read_csv('training_data_initial.csv')
manual_data = pd.read_csv('training_data_manual.csv')

# 合并（手动标注优先）
all_data = pd.concat([rule_data, manual_data])
all_data = all_data.drop_duplicates(subset=['camera_id'], keep='last')

# 添加样本权重
all_data['sample_weight'] = all_data['source'].apply(
    lambda x: 10.0 if x == 'manual' else 1.0
)

all_data.to_csv('training_data_merged.csv', index=False)
print(f"Total samples: {len(all_data)}")
print(f"Manual annotations: {len(all_data[all_data['source']=='manual'])}")
print(f"Rule-based: {len(all_data[all_data['source']=='rule'])}")
```

---

## Phase 2: 特征工程 (Feature Engineering)

### 2.1 特征列表

**数值特征**:
- `score`: 直接使用 (0-100)
- `is_daytime`: 布尔转换为 0/1

**类别特征 (需要编码)**:
- `label`: sunset-primary, sunset-extended, city-skyline-night, night, etc. → One-hot encoding
- `weather_class`: clear, partly-cloudy, other → One-hot encoding
- `tags`: City Skyline, Street Scene, Ski Resort, etc. → Multi-hot encoding

**衍生特征**:
- `is_weather_resistant`: tags 包含 City Skyline/Street Scene/Railway/Ski Resort/Wildlife
- `is_night_scene`: label 包含 "night"
- `is_golden_hour`: label 包含 "sunset" 或 "sunrise"
- `is_blue_hour`: label 包含 "blue-hour"

### 2.2 特征编码脚本

**脚本**: `scripts/feature_engineering.py`

```python
import pandas as pd
from sklearn.preprocessing import LabelEncoder, MultiLabelBinarizer

def engineer_features(df):
    # 数值特征
    X_numeric = df[['score']].copy()
    X_numeric['is_daytime'] = df['is_daytime'].map({True: 1, False: 0, 'true': 1, 'false': 0})

    # 类别特征 - label
    label_dummies = pd.get_dummies(df['label'], prefix='label')

    # 类别特征 - weather_class
    weather_dummies = pd.get_dummies(df['weather_class'], prefix='weather')

    # Multi-hot encoding for tags
    df['tags_list'] = df['tags'].fillna('').apply(lambda x: x.split('|') if x else [])
    mlb = MultiLabelBinarizer()
    tags_encoded = pd.DataFrame(
        mlb.fit_transform(df['tags_list']),
        columns=[f'tag_{tag}' for tag in mlb.classes_],
        index=df.index
    )

    # 衍生特征
    weather_resistant_tags = ['City Skyline', 'Street Scene', 'Railway', 'Ski Resort', 'Wildlife']
    X_numeric['is_weather_resistant'] = df['tags_list'].apply(
        lambda tags: int(any(tag in weather_resistant_tags for tag in tags))
    )

    X_numeric['is_night_scene'] = df['label'].apply(
        lambda x: int('night' in str(x).lower())
    )

    X_numeric['is_golden_hour'] = df['label'].apply(
        lambda x: int('sunset' in str(x) or 'sunrise' in str(x))
    )

    X_numeric['is_blue_hour'] = df['label'].apply(
        lambda x: int('blue-hour' in str(x))
    )

    # 合并所有特征
    X = pd.concat([X_numeric, label_dummies, weather_dummies, tags_encoded], axis=1)

    # 目标变量
    y = df['pool_id']

    # 样本权重
    sample_weight = df['sample_weight'] if 'sample_weight' in df.columns else None

    return X, y, sample_weight, mlb

# 使用示例
df = pd.read_csv('training_data_merged.csv')
X, y, sample_weight = engineer_features(df)
```

---

## Phase 3: 模型训练 (Model Training)

### 3.1 模型选择

**推荐: XGBoost Decision Tree**

优势:
- 处理类别特征强
- 可解释性高
- 训练快速
- 易于导出为JSON

备选:
- LightGBM (更快，但导出复杂)
- scikit-learn DecisionTreeClassifier (最简单)

### 3.2 训练脚本

**脚本**: `scripts/train_model.py`

```python
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import classification_report, confusion_matrix
import xgboost as xgb
import json
from feature_engineering import engineer_features

# 1. 加载数据
df = pd.read_csv('training_data_merged.csv')
X, y, sample_weight, mlb = engineer_features(df)

# 2. 划分训练集和测试集
X_train, X_test, y_train, y_test, sw_train, sw_test = train_test_split(
    X, y, sample_weight, test_size=0.2, random_state=42, stratify=y
)

# 3. 训练 XGBoost
model = xgb.XGBClassifier(
    max_depth=6,              # 控制树深度，避免过拟合
    n_estimators=50,          # 树的数量
    learning_rate=0.1,
    objective='multi:softmax',  # 多分类
    num_class=5,              # Pool 1-5
    random_state=42
)

model.fit(
    X_train, y_train - 1,  # XGBoost expects labels 0-4, not 1-5
    sample_weight=sw_train
)

# 4. 评估
y_pred = model.predict(X_test) + 1  # Convert back to 1-5

print("=== Classification Report ===")
print(classification_report(y_test, y_pred, labels=[1,2,3,4,5]))

print("\n=== Confusion Matrix ===")
print(confusion_matrix(y_test, y_pred, labels=[1,2,3,4,5]))

# 5. 特征重要性
feature_importance = pd.DataFrame({
    'feature': X.columns,
    'importance': model.feature_importances_
}).sort_values('importance', ascending=False)

print("\n=== Top 10 Important Features ===")
print(feature_importance.head(10))

# 6. 交叉验证
cv_scores = cross_val_score(model, X, y - 1, cv=5, scoring='accuracy')
print(f"\n=== Cross-validation Accuracy: {cv_scores.mean():.3f} (+/- {cv_scores.std():.3f}) ===")

# 7. 保存模型
model.save_model('pool_assignment_model.json')
print("\nModel saved to pool_assignment_model.json")

# 8. 保存特征元数据
metadata = {
    'feature_names': X.columns.tolist(),
    'tag_classes': [f'tag_{tag}' for tag in mlb.classes_],
    'label_classes': [col for col in X.columns if col.startswith('label_')],
    'weather_classes': [col for col in X.columns if col.startswith('weather_')],
}

with open('model_metadata.json', 'w') as f:
    json.dump(metadata, f, indent=2)
print("Metadata saved to model_metadata.json")
```

**运行**: `python scripts/train_model.py`

### 3.3 评估指标

**关键指标**:
- Overall Accuracy: 目标 >90%
- Per-class Precision/Recall:
  - Pool 1: Precision >95% (避免误展示低质量为黄金时段)
  - Pool 5: Recall >90% (确保低质量被过滤)
  - Pool 2-4: Balanced F1-score >85%

**混淆矩阵分析**:
- Pool 1 误判为 Pool 2: 可接受 (都是高质量)
- Pool 5 误判为 Pool 4: 不可接受 (低质量泄露)
- Pool 3 误判为 Pool 4: 可接受 (质量差异小)

---

## Phase 4: 模型导出与集成 (Model Export & Integration)

### 4.1 导出为TypeScript可用格式

**选项1: JSON决策树** (推荐)

**脚本**: `scripts/export_to_json_tree.py`

```python
import xgboost as xgb
import json

model = xgb.Booster()
model.load_model('pool_assignment_model.json')

# 导出为JSON格式
trees_json = model.get_dump(dump_format='json')

with open('model_trees.json', 'w') as f:
    json.dump([json.loads(tree) for tree in trees_json], f, indent=2)

print("Trees exported to model_trees.json")
```

**选项2: ONNX Runtime** (更通用)

```python
import onnxmltools
from onnxconverter_common import FloatTensorType

initial_type = [('float_input', FloatTensorType([None, X.shape[1]]))]
onnx_model = onnxmltools.convert_xgboost(model, initial_types=initial_type)

with open("pool_assignment_model.onnx", "wb") as f:
    f.write(onnx_model.SerializeToString())
```

### 4.2 TypeScript集成

**新文件**: `lib/ml-pool-assignment.ts`

```typescript
import * as onnx from 'onnxruntime-node';
import type { CameraEvaluation } from './client-ranking';
import type { PoolId } from './camera-pools';
import modelMetadata from '../model_metadata.json';

let session: onnx.InferenceSession | null = null;

async function loadModel() {
  if (!session) {
    session = await onnx.InferenceSession.create('./pool_assignment_model.onnx');
  }
  return session;
}

export async function assignToPoolML(
  evaluation: CameraEvaluation,
  tags?: string[]
): Promise<PoolId> {
  const session = await loadModel();

  // 1. 特征工程 (与Python保持一致)
  const features = engineerFeatures(evaluation, tags);

  // 2. 推理
  const tensor = new onnx.Tensor('float32', features, [1, features.length]);
  const results = await session.run({ float_input: tensor });
  const poolId = results.output.data[0] + 1; // 转换回1-5

  return poolId as PoolId;
}

function engineerFeatures(
  evaluation: CameraEvaluation,
  tags?: string[]
): Float32Array {
  const { score, label, weatherClass, isDaytime } = evaluation;

  // 创建特征向量 (顺序必须与训练时一致)
  const featureVector = new Float32Array(modelMetadata.feature_names.length);

  // 数值特征
  featureVector[0] = score;
  featureVector[1] = isDaytime ? 1 : 0;

  // 衍生特征
  const weatherResistantTags = ['City Skyline', 'Street Scene', 'Railway', 'Ski Resort', 'Wildlife'];
  featureVector[2] = tags?.some(t => weatherResistantTags.includes(t)) ? 1 : 0;
  featureVector[3] = label.includes('night') ? 1 : 0;
  featureVector[4] = label.includes('sunset') || label.includes('sunrise') ? 1 : 0;
  featureVector[5] = label.includes('blue-hour') ? 1 : 0;

  // One-hot encoding for label
  const labelIdx = modelMetadata.label_classes.indexOf(`label_${label}`);
  if (labelIdx >= 0) {
    featureVector[6 + labelIdx] = 1;
  }

  // One-hot encoding for weather
  const weatherIdx = modelMetadata.weather_classes.indexOf(`weather_${weatherClass}`);
  if (weatherIdx >= 0) {
    featureVector[6 + modelMetadata.label_classes.length + weatherIdx] = 1;
  }

  // Multi-hot encoding for tags
  const tagOffset = 6 + modelMetadata.label_classes.length + modelMetadata.weather_classes.length;
  tags?.forEach(tag => {
    const tagIdx = modelMetadata.tag_classes.indexOf(`tag_${tag}`);
    if (tagIdx >= 0) {
      featureVector[tagOffset + tagIdx] = 1;
    }
  });

  return featureVector;
}
```

### 4.3 替换现有逻辑

**修改**: `app/api/camera-pools/current/route.ts`

```typescript
import { assignToPoolML } from '@/lib/ml-pool-assignment';

// 在 GET 函数中替换
const poolId = await assignToPoolML(evaluation, tags);  // 使用ML
// const poolId = assignToPool(evaluation, tags);  // 旧规则
```

**渐进式迁移策略**:

1. **A/B测试模式**: 添加环境变量 `USE_ML_POOL_ASSIGNMENT=true`
2. **对比验证**: 同时运行两种方法，记录差异
3. **逐步切换**: Pool 4/5先切换 → Pool 2/3 → Pool 1

---

## Phase 5: 持续改进 (Continuous Improvement)

### 5.1 数据收集反馈循环

**用户行为数据收集** (弱监督信号):

```typescript
// lib/user-feedback.ts
export async function recordUserAction(
  cameraId: string,
  action: 'skip' | 'watch' | 'favorite',
  watchDurationSeconds?: number
) {
  await supabaseAdmin.from('user_actions').insert({
    camera_id: cameraId,
    action,
    watch_duration: watchDurationSeconds,
    timestamp: new Date().toISOString(),
  });
}

// 推断质量标签
// skip < 5秒 → pool 可能过高
// watch > 30秒 → pool 准确或偏低
// favorite → 高质量确认
```

### 5.2 自动重训练流程

**脚本**: `scripts/retrain_pipeline.sh`

```bash
#!/bin/bash

# 1. 导出最新数据 (包含用户行为推断的标签)
npx tsx scripts/export_training_data.ts

# 2. 合并手动标注
python scripts/merge_training_data.py

# 3. 重新训练
python scripts/train_model.py

# 4. 评估是否改进
python scripts/evaluate_new_model.py

# 5. 如果改进，部署新模型
if [ $? -eq 0 ]; then
  cp pool_assignment_model.onnx ../public/models/
  echo "New model deployed"
fi
```

**定期触发**: 每周运行一次，或累计100个新标注后

### 5.3 监控指标

**关键监控**:
- Pool 分布变化 (是否突然倾斜)
- Pool 5 大小 (应保持在总数的5-10%)
- Pool 1 准确率 (通过用户行为验证)
- 模型推理延迟 (应 <10ms)

---

## Phase 6: 成本与资源估算

### 6.1 开发成本
- Phase 1-2: 1-2天 (数据导出 + 特征工程)
- Phase 3: 1天 (模型训练与调优)
- Phase 4: 1-2天 (集成与测试)
- Phase 5: 持续 (监控与改进)

**总计**: ~5天开发时间

### 6.2 运行成本
- 训练: **$0** (本地运行 Python)
- 推理: **$0** (ONNX Runtime in Node.js)
- 存储: **$0** (模型 <10MB)

**无额外API费用，完全本地化**

### 6.3 硬件要求
- 训练: 任何笔记本 (XGBoost在CPU上即可)
- 推理: Vercel Edge Function (ONNX Runtime支持)

---

## 附录 A: 文件清单

### 数据文件
- `training_data_initial.csv`: 规则生成的初始数据
- `training_data_manual.csv`: 手动标注数据
- `training_data_merged.csv`: 合并后的训练数据

### 模型文件
- `pool_assignment_model.json`: XGBoost原生格式
- `pool_assignment_model.onnx`: ONNX格式 (推理用)
- `model_metadata.json`: 特征元数据
- `model_trees.json`: 决策树JSON (可选)

### 脚本
- `scripts/export_training_data.ts`: 导出训练数据
- `scripts/feature_engineering.py`: 特征工程
- `scripts/train_model.py`: 训练模型
- `scripts/export_to_json_tree.py`: 导出决策树
- `scripts/retrain_pipeline.sh`: 自动重训练

### 代码
- `lib/ml-pool-assignment.ts`: ML版本的pool分配
- `app/dev/annotate/page.tsx`: 标注界面

---

## 附录 B: 快速开始

### 立即开始训练 (假设已有数据)

```bash
# 1. 安装依赖
pip install xgboost scikit-learn pandas numpy onnxmltools

# 2. 导出初始数据
npx tsx scripts/export_training_data.ts

# 3. 手动标注 (可选，但建议至少标注50个边界案例)
# 访问 http://localhost:3000/dev/annotate

# 4. 合并数据
python scripts/merge_training_data.py

# 5. 训练模型
python scripts/train_model.py

# 6. 集成到应用
# 修改 app/api/camera-pools/current/route.ts 使用 assignToPoolML

# 7. 测试
npm run dev
# 访问 http://localhost:3000/dev/camera-pools
```

---

## 附录 C: 回滚计划

如果ML模型表现不佳:

1. **立即回滚**: `USE_ML_POOL_ASSIGNMENT=false`
2. **分析差异**: 运行 `scripts/compare_rule_vs_ml.py`
3. **增加标注**: 标注ML错误的案例
4. **重新训练**: 使用加权样本
5. **A/B测试**: 50%用户用ML，50%用规则

---

## 总结

这是一个**零成本、渐进式**的ML迁移方案:
- 利用现有规则作为启动数据
- 通过手动标注纠正边界案例
- 本地训练，无API费用
- 可解释、可监控、可回滚

**优先级**:
1. **立即执行**: Phase 1.1 (导出数据)
2. **本周完成**: Phase 1.2-3.2 (标注 + 训练第一个模型)
3. **下周集成**: Phase 4 (集成到生产)
4. **持续优化**: Phase 5 (收集反馈，重训练)

**关键成功因素**:
- 至少标注50-100个高质量边界案例
- 定期监控Pool分布和用户行为
- 每周或每月重训练，融入新数据
