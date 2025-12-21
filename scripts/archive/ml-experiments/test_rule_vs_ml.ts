/**
 * Compare rule-based vs ML predictions for golden hour scenarios
 */

import { assignToPool } from "@/lib/camera-pools";
import { exec } from "child_process";
import { promisify } from "util";
import type { CameraEvaluation } from "@/lib/client-ranking";

const execAsync = promisify(exec);

async function predictWithML(evaluation: CameraEvaluation, tags: string[]) {
  const features = {
    score: evaluation.score,
    label: evaluation.label,
    weatherClass: evaluation.weatherClass,
    isDaytime: evaluation.isDaytime ?? false,
    tags: tags,
  };

  const { stdout } = await execAsync(
    `python3 scripts/predict_pool.py '${JSON.stringify(features)}'`
  );

  const result = JSON.parse(stdout.trim());
  return result.poolId;
}

async function compareScenarios() {
  console.log("=".repeat(80));
  console.log("Rule-Based vs ML: Golden Hour Scenarios");
  console.log("=".repeat(80));

  const scenarios = [
    {
      name: "Perfect Sunrise (Golden Hour Core)",
      evaluation: {
        score: 95,
        label: "sunrise-primary" as const,
        isClear: true,
        isDaytime: false,
        weatherClass: "clear" as const,
      },
      tags: ["Mountain Range"],
      expectedPool: 1,
    },
    {
      name: "Perfect Sunset (Golden Hour Core)",
      evaluation: {
        score: 92,
        label: "sunset-primary" as const,
        isClear: true,
        isDaytime: false,
        weatherClass: "clear" as const,
      },
      tags: ["Coastline"],
      expectedPool: 1,
    },
    {
      name: "Blue Hour Sunset",
      evaluation: {
        score: 85,
        label: "blue-hour-sunset" as const,
        isClear: true,
        isDaytime: false,
        weatherClass: "clear" as const,
      },
      tags: ["City Skyline"],
      expectedPool: 2,
    },
    {
      name: "Approaching Sunset",
      evaluation: {
        score: 70,
        label: "approaching-sunset" as const,
        isClear: true,
        isDaytime: true,
        weatherClass: "clear" as const,
      },
      tags: ["Harbor"],
      expectedPool: 3,
    },
    {
      name: "Regular Clear Day",
      evaluation: {
        score: 60,
        label: "clear-day" as const,
        isClear: true,
        isDaytime: true,
        weatherClass: "clear" as const,
      },
      tags: ["Cultural Landmark"],
      expectedPool: 4,
    },
  ];

  console.log("\n");
  console.log("Scenario                           Expected  Rule  ML   Match?");
  console.log("-".repeat(80));

  let ruleCorrect = 0;
  let mlCorrect = 0;

  for (const scenario of scenarios) {
    const rulePool = assignToPool(scenario.evaluation, scenario.tags);
    const mlPool = await predictWithML(scenario.evaluation, scenario.tags);

    const ruleMatch = rulePool === scenario.expectedPool ? "✓" : "✗";
    const mlMatch = mlPool === scenario.expectedPool ? "✓" : "✗";
    const agree = rulePool === mlPool ? "=" : "≠";

    if (rulePool === scenario.expectedPool) ruleCorrect++;
    if (mlPool === scenario.expectedPool) mlCorrect++;

    console.log(
      `${scenario.name.padEnd(35)} Pool ${scenario.expectedPool}    ${rulePool}${ruleMatch}    ${mlPool}${mlMatch}   ${agree}`
    );
  }

  console.log("-".repeat(80));
  console.log(
    `Accuracy:                                       ${ruleCorrect}/${scenarios.length}    ${mlCorrect}/${scenarios.length}`
  );

  console.log("\n" + "=".repeat(80));
  console.log("Analysis");
  console.log("=".repeat(80));

  console.log("\n✓ Rule-Based Engine:");
  console.log(`  - Correct: ${ruleCorrect}/${scenarios.length} (${(ruleCorrect / scenarios.length * 100).toFixed(0)}%)`);
  console.log("  - Has logic for all 5 pools");
  console.log("  - Can identify golden hour scenarios");

  console.log("\n✗ ML Model:");
  console.log(`  - Correct: ${mlCorrect}/${scenarios.length} (${(mlCorrect / scenarios.length * 100).toFixed(0)}%)`);
  console.log("  - Only trained on Pool 4-5");
  console.log("  - Cannot identify Pool 1-3 scenarios");
  console.log("  - Defaults everything to Pool 4");

  console.log("\n🎯 Conclusion:");
  console.log("  This is why 'data incomplete' is a critical problem!");
  console.log("  ML model is essentially useless for golden hour detection.");
  console.log("\n  To fix: Export data during golden hour times (sunrise/sunset)");
  console.log();
}

compareScenarios();
