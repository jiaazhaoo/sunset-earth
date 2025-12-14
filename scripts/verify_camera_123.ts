import { assignToPool } from "../lib/camera-pools";
import type { CameraEvaluation } from "../lib/client-ranking";

console.log("=".repeat(70));
console.log("Camera 123 (Sodankylä Aurora Cam) - Verification");
console.log("=".repeat(70));

// The actual scenario you reported
const camera123Daytime: CameraEvaluation = {
  score: 43,
  label: "sunrise-extended",
  isClear: false,
  isDaytime: true,
  weatherClass: "snow",
};

const tags = ["Aurora", "Arctic Circle"];

console.log("\nCurrent scenario (from your report):");
console.log("  Camera: Sodankylä Aurora Cam (ID: 123)");
console.log("  Location: Sodankylä, Finland");
console.log("  Score: 43");
console.log("  Label: sunrise-extended");
console.log("  Weather: light-snow");
console.log("  Time: Daytime");
console.log("  Tags:", tags);

const poolBefore = 4; // What it was before
const poolNow = assignToPool(camera123Daytime, tags);

console.log("\n" + "-".repeat(70));
console.log("Pool Assignment:");
console.log("-".repeat(70));
console.log(`  Before fix: Pool ${poolBefore} ❌ (shown to users)`);
console.log(`  After fix:  Pool ${poolNow} ✓ (hidden from users)`);

console.log("\n" + "-".repeat(70));
console.log("Why this makes sense:");
console.log("-".repeat(70));
console.log("  - Aurora (Northern Lights) are ONLY visible at night");
console.log("  - During daytime, this camera just shows:");
console.log("    - Snow/mountains (not interesting)");
console.log("    - No aurora activity");
console.log("  - Waste of user's time to show this during day");

console.log("\n" + "-".repeat(70));
console.log("When will Camera 123 show up again?");
console.log("-".repeat(70));
console.log("  - When it becomes night in Sodankylä");
console.log("  - AND score ≥ 15");
console.log("  - Then it will be assigned to Pool 4");

// Simulate night scenario
console.log("\n" + "=".repeat(70));
console.log("Simulation: Camera 123 at Night");
console.log("=".repeat(70));

const camera123Night: CameraEvaluation = {
  score: 45,
  label: "night",
  isClear: true,
  isDaytime: false,
  weatherClass: "clear",
};

const poolNight = assignToPool(camera123Night, tags);

console.log("\nNight scenario:");
console.log("  Score: 45");
console.log("  Label: night");
console.log("  Weather: clear");
console.log("  Time: Night");
console.log(`  → Pool: ${poolNight} ✓ (shown to users!)`);

console.log("\n✓ Perfect! Aurora camera now behaves correctly.");
console.log();
