/**
 * ML-based Pool Assignment
 *
 * This module uses a trained XGBoost model to assign cameras to pools.
 * Instead of ONNX, we use a Python child process for inference.
 */

import type { CameraEvaluation } from "./client-ranking";
import type { PoolId } from "./camera-pools";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);

export async function assignToPoolML(
  evaluation: CameraEvaluation,
  tags?: string[]
): Promise<PoolId> {
  try {
    // Prepare features as JSON
    const features = {
      score: evaluation.score,
      label: evaluation.label,
      weatherClass: evaluation.weatherClass,
      isDaytime: evaluation.isDaytime ?? false,
      tags: tags ?? [],
    };

    // Call Python inference script
    const scriptPath = path.join(process.cwd(), "scripts", "predict_pool.py");
    const { stdout } = await execAsync(
      `python3 "${scriptPath}" '${JSON.stringify(features)}'`
    );

    const result = JSON.parse(stdout.trim());
    return result.poolId as PoolId;
  } catch (error) {
    console.error("[ml-pool-assignment] Inference failed:", error);
    // Fallback to rule-based assignment
    const { assignToPool } = await import("./camera-pools");
    return assignToPool(evaluation, tags);
  }
}

/**
 * Batch prediction for multiple cameras (more efficient)
 */
export async function assignToPoolMLBatch(
  items: Array<{ evaluation: CameraEvaluation; tags?: string[] }>
): Promise<PoolId[]> {
  try {
    // Prepare batch features
    const featuresBatch = items.map((item) => ({
      score: item.evaluation.score,
      label: item.evaluation.label,
      weatherClass: item.evaluation.weatherClass,
      isDaytime: item.evaluation.isDaytime ?? false,
      tags: item.tags ?? [],
    }));

    // Call Python batch inference script
    const scriptPath = path.join(
      process.cwd(),
      "scripts",
      "predict_pool_batch.py"
    );
    const { stdout } = await execAsync(
      `python3 "${scriptPath}" '${JSON.stringify(featuresBatch)}'`,
      {
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large batches
      }
    );

    const result = JSON.parse(stdout.trim());
    return result.poolIds as PoolId[];
  } catch (error) {
    console.error("[ml-pool-assignment] Batch inference failed:", error);
    // Fallback to rule-based assignment
    const { assignToPool } = await import("./camera-pools");
    return items.map((item) => assignToPool(item.evaluation, item.tags));
  }
}
