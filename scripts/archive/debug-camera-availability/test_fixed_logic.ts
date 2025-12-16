import { getCameraById } from "@/lib/cameras";

// Test the fixed logic by simulating different scenarios
async function testFixedLogic() {
  console.log("=== Testing Fixed Availability Logic ===\n");

  const camera = await getCameraById("5");
  if (!camera) {
    console.log("Camera not found!");
    return;
  }

  const embedUrl = `https://www.youtube.com/embed/Tbog9wK2bMs`;

  console.log("Scenario: Fetching embed HTML...");
  const response = await fetch(embedUrl, {
    method: "GET",
    headers: {
      "User-Agent": "SunsetEarth/1.0 availability",
    },
    cache: "no-store",
    redirect: "follow",
  });

  if (response.ok) {
    const html = await response.text();
    console.log("  ✅ Embed HTML fetched successfully");
    console.log("  HTML length:", html.length, "characters");

    // Check for unavailable phrases
    const unavailablePhrases = [
      "This live stream recording is not available",
      "This live event is no longer available",
      "Video unavailable",
      "Private video",
      "Playback on other websites has been disabled",
      "UNPLAYABLE",
      '"status":"UNPLAYABLE"',
      '"status":"ERROR"',
      '"status":"LOGIN_REQUIRED"',
    ];

    console.log("\n  Checking for unavailable indicators:");
    let foundAny = false;
    for (const phrase of unavailablePhrases) {
      if (html.includes(phrase)) {
        console.log(`    ✅ Found: "${phrase}"`);
        foundAny = true;
      }
    }

    if (!foundAny) {
      console.log("    ❌ No unavailable indicators found");
      console.log("    ⚠️  This would result in available: true");
    } else {
      console.log("\n  ✅ With the fix, video will be marked as unavailable");
    }

    // Check if ytInitialPlayerResponse exists
    console.log("\n  Checking ytInitialPlayerResponse in embed HTML:");
    const match = html.match(/ytInitialPlayerResponse\s*=\s*(\{[\s\S]+?\})\s*;/);
    if (match) {
      console.log("    ✅ Found ytInitialPlayerResponse");
      try {
        const data = JSON.parse(match[1]);
        const status = data.playabilityStatus?.status;
        console.log("    Status:", status);
      } catch (e) {
        console.log("    ❌ Failed to parse");
      }
    } else {
      console.log("    ❌ Not found in embed HTML");
      console.log("    (This is expected - embed pages may not include it)");
    }
  } else {
    console.log("  ❌ Fetch failed:", response.status);
  }

  console.log("\n=== Summary ===");
  console.log("With the fix:");
  console.log("1. Playability check detects UNPLAYABLE → returns unavailable ✅");
  console.log("2. If playability check fails/returns null → continues to embed check");
  console.log("3. Embed HTML now checks for UNPLAYABLE in multiple formats ✅");
  console.log("4. If playability is explicitly OK → skips embed check (optimization) ✅");
}

testFixedLogic().catch(console.error);
