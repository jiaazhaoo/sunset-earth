import { calculateSmartSimilarity, calculateSimilarity } from "@/lib/youtube";

async function testSmartMatching() {
  console.log("=== Testing Smart Similarity Matching ===\n");

  const testCases = [
    {
      reference: "Upper Geyser Basin, Yellowstone",
      candidates: [
        "🌎 LIVE Yellowstone National Park | Old Faithful | Relaxing Music",
        "🌎 Incredible ISS Astronaut Spacewalk Go Pro 🚀 Space Ambient Music",
        "🌍 LIVE Earthquake Tracker 24/7",
      ]
    },
    {
      reference: "SurveillanceMap LIVE · Erster Schnee · Zermatt, Schweiz",
      candidates: [
        "SurveillanceMap LIVE · Above the Sky · Lower Manhattan, New York, New York",
        "SurveillanceMap LIVE · Vágur South West View · Faroe Islands, Arctic",
        "SurveillanceMap LIVE · Zermatt Mountain View · Switzerland",
      ]
    },
    {
      reference: "Wellington Harbour NZ 4K Live Stream",
      candidates: [
        "Wellington Harbour NZ 4K Live Stream",
        "Auckland Harbour Live",
        "Sydney Harbour Bridge Live",
      ]
    }
  ];

  for (const testCase of testCases) {
    console.log(`\nReference: "${testCase.reference}"`);
    console.log("=".repeat(80));

    for (const candidate of testCase.candidates) {
      const basicSim = calculateSimilarity(testCase.reference, candidate);
      const smartSim = calculateSmartSimilarity(testCase.reference, candidate);

      const basicMatch = basicSim >= 0.75 ? "✅" : "❌";
      const smartMatch = smartSim >= 0.5 ? "✅" : "❌";

      console.log(`\nCandidate: "${candidate}"`);
      console.log(`  Basic:  ${basicMatch} ${basicSim.toFixed(3)} ${basicSim >= 0.75 ? "(EXACT MATCH)" : ""}`);
      console.log(`  Smart:  ${smartMatch} ${smartSim.toFixed(3)} ${smartSim >= 0.5 ? "(SMART MATCH)" : ""}`);

      if (smartSim >= 0.3 && smartSim < 0.5) {
        console.log(`  Relaxed: ⚠️  ${smartSim.toFixed(3)} (RELAXED MATCH)`);
      }
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("Summary:");
  console.log("- EXACT MATCH (0.75+): High confidence, same video");
  console.log("- SMART MATCH (0.5+): Good confidence, related location/content");
  console.log("- RELAXED MATCH (0.3+): Low confidence, fallback option");
}

testSmartMatching().catch(console.error);
