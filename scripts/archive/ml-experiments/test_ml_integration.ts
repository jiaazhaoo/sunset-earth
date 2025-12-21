/**
 * Test ML-based pool assignment
 */

import { assignToPoolML, assignToPoolMLBatch } from "@/lib/ml-pool-assignment";
import type { CameraEvaluation } from "@/lib/client-ranking";

async function testSinglePrediction() {
  console.log("=== Testing Single Prediction ===\n");

  const evaluation: CameraEvaluation = {
    score: 58,
    label: "clear-day",
    isClear: true,
    isDaytime: true,
    weatherClass: "clear",
  };

  const tags = ["Railway"];

  console.log("Input:");
  console.log("  Score:", evaluation.score);
  console.log("  Label:", evaluation.label);
  console.log("  Weather:", evaluation.weatherClass);
  console.log("  Tags:", tags);

  const poolId = await assignToPoolML(evaluation, tags);

  console.log("\nPredicted Pool:", poolId);
}

async function testBatchPrediction() {
  console.log("\n=== Testing Batch Prediction ===\n");

  const items = [
    {
      evaluation: {
        score: 58,
        label: "clear-day" as const,
        isClear: true,
        isDaytime: true,
        weatherClass: "clear" as const,
      },
      tags: ["Railway"],
    },
    {
      evaluation: {
        score: 25,
        label: "clear-day" as const,
        isClear: false,
        isDaytime: true,
        weatherClass: "cloudy" as const,
      },
      tags: ["Cultural Landmark"],
    },
    {
      evaluation: {
        score: 18,
        label: "city-skyline-night" as const,
        isClear: true,
        isDaytime: false,
        weatherClass: "clear" as const,
      },
      tags: ["City Skyline"],
    },
  ];

  console.log(`Testing batch of ${items.length} cameras...`);

  const poolIds = await assignToPoolMLBatch(items);

  console.log("\nResults:");
  items.forEach((item, i) => {
    console.log(
      `  Camera ${i + 1}: score=${item.evaluation.score}, label=${item.evaluation.label} → Pool ${poolIds[i]}`
    );
  });
}

async function testPerformance() {
  console.log("\n=== Testing Performance ===\n");

  const evaluation: CameraEvaluation = {
    score: 58,
    label: "clear-day",
    isClear: true,
    isDaytime: true,
    weatherClass: "clear",
  };

  const tags = ["Railway"];

  const iterations = 10;
  const start = Date.now();

  for (let i = 0; i < iterations; i++) {
    await assignToPoolML(evaluation, tags);
  }

  const duration = Date.now() - start;
  const avgTime = duration / iterations;

  console.log(`Completed ${iterations} predictions in ${duration}ms`);
  console.log(`Average time per prediction: ${avgTime.toFixed(1)}ms`);
}

async function main() {
  try {
    await testSinglePrediction();
    await testBatchPrediction();
    await testPerformance();

    console.log("\n✓ All tests passed!");
  } catch (error) {
    console.error("\n✗ Test failed:", error);
    process.exit(1);
  }
}

main();
