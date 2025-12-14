# ML Training Summary - 2025-12-14

## 训练结果

### 模型性能
- **训练准确率**: 100%
- **测试准确率**: 100%
- **训练样本数**: 123个摄像头
- **特征数量**: 29个特征

### Pool分布 (当前数据)
- Pool 1: 0 cameras (0.0%) - 无黄金时段数据
- Pool 2: 0 cameras (0.0%) - 无黄金时段数据
- Pool 3: 0 cameras (0.0%) - 无黄金时段数据
- Pool 4: 62 cameras (50.4%) - 中等质量
- Pool 5: 61 cameras (49.6%) - 低质量

**说明**: 当前只有Pool 4和5的数据是正常的，因为导出数据时没有黄金时段。模型已经成功学会区分这两个池子。

### Top 10重要特征
1. **score** (0.4256) - 分数是最重要的特征
2. **tag_Coastline** (0.1554) - 海岸线标签
3. **is_weather_resistant** (0.1243) - 天气抗性
4. **weather_clear** (0.0882) - 晴天
5. **weather_other** (0.0480) - 其他天气
6. **weather_partly-cloudy** (0.0448) - 部分多云
7. **tag_Street Scene** (0.0326) - 街景
8. **tag_Wildlife** (0.0316) - 野生动物
9. **is_night_scene** (0.0271) - 夜景
10. **tag_Cultural Landmark** (0.0224) - 文化地标

## 已创建的文件

### 数据文件
- `training_data_initial.csv` - 123个样本的初始训练数据
- `model_metadata.json` - 模型元数据（特征名称、映射等）

### 模型文件
- `pool_assignment_model.json` - XGBoost模型（JSON格式）

### 脚本文件
- `scripts/export_training_data.ts` - 导出训练数据
- `scripts/train_model.py` - 训练XGBoost模型
- `scripts/predict_pool.py` - 单个摄像头预测
- `scripts/predict_pool_batch.py` - 批量摄像头预测
- `scripts/test_ml_integration.ts` - 测试ML集成

### 代码文件
- `lib/ml-pool-assignment.ts` - TypeScript ML推理接口
  - `assignToPoolML()` - 单个预测
  - `assignToPoolMLBatch()` - 批量预测

## 性能测试

### 推理速度
- 单次预测: ~1123ms（包含Python进程启动）
- 10次连续预测: 平均1123ms/次

**注意**: 这个速度对于批量处理来说太慢了。建议：
1. 使用批量API (`assignToPoolMLBatch`) 可以大幅提升性能
2. 或者考虑部署Python服务器（FastAPI）保持模型在内存中
3. 对于实时请求，保持使用规则引擎（`assignToPool`）

## 使用方法

### 方法1: 直接使用Python脚本（推荐用于批量）

```bash
# 单个预测
python3 scripts/predict_pool.py '{"score": 58, "label": "clear-day", "weatherClass": "clear", "isDaytime": true, "tags": ["Railway"]}'

# 批量预测
python3 scripts/predict_pool_batch.py '[{...}, {...}, {...}]'
```

### 方法2: TypeScript集成

```typescript
import { assignToPoolML, assignToPoolMLBatch } from "@/lib/ml-pool-assignment";

// 单个预测
const poolId = await assignToPoolML(evaluation, tags);

// 批量预测
const poolIds = await assignToPoolMLBatch(items);
```

### 方法3: 集成到现有API (未实现)

修改 `app/api/camera-pools/current/route.ts`:

```typescript
// 替换这行:
const poolId = assignToPool(evaluation, tags);

// 为:
const poolId = await assignToPoolML(evaluation, tags);
```

## 下一步建议

### 短期（立即可做）

1. **收集黄金时段数据**
   - 等待黄金时段（日出/日落）
   - 重新运行 `npx tsx --env-file=.env.local scripts/export_training_data.ts`
   - 重新训练模型 `python3 scripts/train_model.py`

2. **手动标注边界案例**
   - 创建 `training_data_manual.csv` 文件
   - 格式: `camera_id,score,label,weather_class,is_daytime,tags,pool_id,source,timestamp`
   - source设为 `manual`，权重会自动×10

3. **A/B测试**
   - 添加环境变量 `USE_ML_POOL_ASSIGNMENT=true`
   - 对比ML vs规则的分配差异
   - 收集数据分析哪个更好

### 中期（1-2周）

1. **优化推理速度**

   选项A: 部署FastAPI服务
   ```python
   # scripts/serve_model.py
   from fastapi import FastAPI
   import uvicorn

   app = FastAPI()

   @app.post("/predict")
   async def predict(cameras: list):
       return predict_pools_batch(cameras)

   uvicorn.run(app, port=8000)
   ```

   选项B: 将模型转换为纯JavaScript
   - 使用决策树导出为JSON
   - 在TypeScript中实现推理逻辑
   - 速度: <1ms

2. **收集用户行为数据**
   - 记录用户跳过、观看时长
   - 用作弱监督信号改进模型

### 长期（1个月+）

1. **自动重训练流程**
   - 每周或每100个新标注后自动重训练
   - 监控模型性能变化
   - 自动部署如果准确率提升

2. **特征工程优化**
   - 添加时间特征（距离日出/日落的分钟数）
   - 添加地理特征（纬度、经度）
   - 添加历史特征（摄像头历史平均分数）

## 成本分析

### 训练成本
- **计算**: $0（本地CPU训练，<10秒）
- **存储**: $0（模型<1MB）

### 推理成本
- **计算**: $0（本地Python执行）
- **延迟**: ~1秒/次（Python进程启动）

### 优化后推理成本（FastAPI）
- **计算**: $0（本地运行）
- **延迟**: <50ms/次（批量）

## 局限性

1. **当前数据不平衡**: 只有Pool 4和5，需要收集更多黄金时段数据
2. **推理速度慢**: 每次预测启动Python进程，不适合实时请求
3. **无法处理新标签**: 如果出现训练时未见过的label，会被忽略
4. **冷启动问题**: 模型只学到了规则，没有真实的"好坏"标签

## 模型质量评估

### 当前状态
✅ 模型成功训练，100%准确率
✅ 可以区分Pool 4 vs Pool 5
⚠️  数据不完整（缺少Pool 1-3）
⚠️  只学到了规则，未学到用户偏好

### 何时可以替代规则引擎？
需要满足以下条件：
1. 所有5个Pool都有足够数据（每个Pool至少50个样本）
2. 包含手动标注的边界案例（至少100个）
3. 有用户行为数据验证（观看时长、跳过率）
4. 模型准确率在测试集上 >95%

### 当前建议
**继续使用规则引擎 (`assignToPool`)**，因为：
- 规则引擎已经优化得很好
- ML模型数据不足
- 推理速度太慢

ML模型可以用于：
- **离线分析**: 批量评估所有摄像头质量
- **数据标注辅助**: 找出规则可能分配错误的案例
- **A/B测试**: 小流量测试ML分配效果

## 总结

✅ **已完成**:
- 训练数据导出（123个样本）
- XGBoost模型训练（100%准确率）
- Python推理脚本（单个+批量）
- TypeScript集成接口
- 性能测试

📊 **模型状态**: 可用但数据不完整

🚀 **下一步**: 收集黄金时段数据，手动标注边界案例

💡 **建议**: 暂时保持使用规则引擎，ML用于离线分析和标注辅助
