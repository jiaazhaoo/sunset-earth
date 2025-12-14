import { assignToPool } from "../lib/camera-pools";
import type { CameraEvaluation } from "../lib/client-ranking";

console.log("=".repeat(70));
console.log("Aurora Camera Pool Assignment Test");
console.log("=".repeat(70));

const testCases = [
  {
    name: "Aurora camera - Daytime (sunrise-extended, score 43)",
    evaluation: {
      score: 43,
      label: "sunrise-extended" as const,
      isClear: false,
      isDaytime: true,
      weatherClass: "light-snow" as const,
    },
    tags: ["Aurora", "Arctic Circle"],
    expectedPool: 5,
    reason: "Aurora only visible at night, daytime should be Pool 5",
  },
  {
    name: "Aurora camera - Night (good score)",
    evaluation: {
      score: 50,
      label: "night" as const,
      isClear: true,
      isDaytime: false,
      weatherClass: "clear" as const,
    },
    tags: ["Aurora", "Arctic Circle"],
    expectedPool: 4,
    reason: "Aurora at night with decent score should display",
  },
  {
    name: "Aurora camera - Night (low score but acceptable)",
    evaluation: {
      score: 18,
      label: "night" as const,
      isClear: true,
      isDaytime: false,
      weatherClass: "clear" as const,
    },
    tags: ["Aurora", "Arctic Circle"],
    expectedPool: 4,
    reason: "Aurora threshold is 15, score 18 should be Pool 4",
  },
  {
    name: "Aurora camera - Night (too low score)",
    evaluation: {
      score: 12,
      label: "night" as const,
      isClear: false,
      isDaytime: false,
      weatherClass: "other" as const,
    },
    tags: ["Aurora", "Arctic Circle"],
    expectedPool: 5,
    reason: "Score below 15 threshold should be Pool 5",
  },
  {
    name: "Regular camera - Daytime (same score as aurora)",
    evaluation: {
      score: 43,
      label: "clear-day" as const,
      isClear: true,
      isDaytime: true,
      weatherClass: "clear" as const,
    },
    tags: ["Mountain Range"],
    expectedPool: 4,
    reason: "Regular camera with score 43 should be Pool 4",
  },
];

console.log("\n");
console.log("Test Case                                      Score  Day?  Expected  Actual  Result");
console.log("-".repeat(90));

let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  const actualPool = assignToPool(testCase.evaluation, testCase.tags);
  const result = actualPool === testCase.expectedPool ? "✓ PASS" : "✗ FAIL";

  if (actualPool === testCase.expectedPool) {
    passed++;
  } else {
    failed++;
  }

  const dayNight = testCase.evaluation.isDaytime ? "Day " : "Night";

  console.log(
    `${testCase.name.padEnd(47)} ${testCase.evaluation.score.toString().padStart(3)}  ${dayNight}  Pool ${testCase.expectedPool}    Pool ${actualPool}  ${result}`
  );

  if (actualPool !== testCase.expectedPool) {
    console.log(`   ⚠️  Expected Pool ${testCase.expectedPool}, got Pool ${actualPool}`);
    console.log(`   Reason: ${testCase.reason}`);
  }
}

console.log("-".repeat(90));
console.log(`Results: ${passed}/${testCases.length} passed, ${failed}/${testCases.length} failed`);

console.log("\n" + "=".repeat(70));
console.log("Summary");
console.log("=".repeat(70));

if (failed === 0) {
  console.log("\n✓ All tests passed!");
  console.log("\nAurora camera logic working correctly:");
  console.log("  - Daytime aurora → Pool 5 (not shown)");
  console.log("  - Night aurora with score ≥15 → Pool 4");
  console.log("  - Night aurora with score <15 → Pool 5");
} else {
  console.log(`\n⚠️  ${failed} test(s) failed`);
  console.log("Review the logic in lib/camera-pools.ts");
}

console.log();
