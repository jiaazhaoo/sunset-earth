import { getCameraById } from "@/lib/cameras";
import { calculateSimilarity } from "@/lib/youtube";

async function testSimilarity() {
  console.log("=== Testing Title Similarity for Camera 5 ===\n");

  const camera = await getCameraById("5");
  if (!camera) {
    console.log("Camera not found");
    return;
  }

  const referenceTitle = camera.ytbTitle ?? camera.name ?? "";
  console.log(`Reference title: "${referenceTitle}"`);
  console.log();

  const candidates = [
    "🌎 LIVE Yellowstone National Park | Old Faithful | Relaxing Music",
    "🌎 Incredible ISS Astronaut Spacewalk Go Pro 🚀 Space Ambient Music",
    "🌍 LIVE Earthquake Tracker 24/7",
    "🌎 LIVE Christmas 2025 Holiday World Cams 24/7 | Relaxing Music 🎄",
  ];

  console.log("Similarity scores:");
  for (const candidate of candidates) {
    const similarity = calculateSimilarity(referenceTitle, candidate);
    const match = similarity >= 0.75 ? "✅ MATCH" : "❌ NO MATCH";
    console.log(`${match} ${similarity.toFixed(3)} - "${candidate}"`);
  }
}

testSimilarity().catch(console.error);
