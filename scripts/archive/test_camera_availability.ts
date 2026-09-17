/**
 * Test script to debug camera availability detection
 * Run with: npx tsx test_camera_availability.ts
 */

import { getCameraById } from "./lib/cameras";
import { isCameraAvailable } from "./lib/availability";

async function testCamera(cameraId: string) {
  console.log(`\n=== Testing Camera: ${cameraId} ===\n`);

  // 1. Get camera from database
  const camera = await getCameraById(cameraId);
  if (!camera) {
    console.error("Camera not found in database");
    return;
  }

  console.log("Camera info:");
  console.log("- Name:", camera.name);
  console.log("- Source URL:", camera.sourceUrl);
  console.log("- Embed URL:", camera.embedUrl);
  console.log("- Link Available (DB):", camera.linkAvailable);
  console.log("- Last Check:", camera.lastCheck);

  // 2. Test availability detection WITHOUT consent cookie
  console.log("\n--- Test 1: Without consent cookie ---");
  const result1 = await isCameraAvailable(camera, { withConsent: false });
  console.log("Result:", result1);

  // 3. Test availability detection WITH consent cookie
  console.log("\n--- Test 2: With consent cookie ---");
  const result2 = await isCameraAvailable(camera, { withConsent: true });
  console.log("Result:", result2);

  // 4. Detailed HTML fetch test
  console.log("\n--- Test 3: Direct HTML fetch ---");
  if (camera.embedUrl) {
    try {
      const response = await fetch(camera.embedUrl, {
        headers: {
          "User-Agent": "SunsetEarth/1.0 availability",
          Cookie: "CONSENT=YES+cb",
        },
        cache: "no-store",
      });

      console.log("Status:", response.status);
      console.log("Status Text:", response.statusText);

      if (response.ok) {
        const html = await response.text();

        // Check for specific phrases
        const phrases = [
          "This live stream recording is not available",
          "This live event is no longer available",
          "Video unavailable",
          "Private video",
          "Playback on other websites has been disabled",
        ];

        console.log("\nChecking for unavailable phrases:");
        phrases.forEach((phrase) => {
          const found = html.includes(phrase);
          if (found) {
            console.log(`  ✓ FOUND: "${phrase}"`);
          }
        });

        // Check ytInitialPlayerResponse
        const playerMatch = html.match(
          /ytInitialPlayerResponse\s*=\s*(\{[\s\S]+?\})\s*;/
        );
        if (playerMatch) {
          try {
            const playerData = JSON.parse(playerMatch[1]);
            console.log("\nPlayer Response:");
            console.log(
              "- Playability Status:",
              playerData.playabilityStatus?.status
            );
            console.log(
              "- Reason:",
              playerData.playabilityStatus?.reason
            );
            console.log(
              "- Error Screen:",
              playerData.playabilityStatus?.errorScreen
            );
          } catch (e) {
            console.log("Failed to parse ytInitialPlayerResponse");
          }
        } else {
          console.log("\nNo ytInitialPlayerResponse found");
        }
      }
    } catch (error) {
      console.error("Fetch failed:", error);
    }
  }

  // 5. Test oEmbed API
  console.log("\n--- Test 4: YouTube oEmbed API ---");
  if (camera.sourceUrl) {
    try {
      const oembedUrl = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(
        camera.sourceUrl
      )}`;
      const response = await fetch(oembedUrl, {
        headers: {
          "User-Agent": "SunsetEarth/1.0 availability",
        },
      });

      console.log("oEmbed Status:", response.status);
      if (response.ok) {
        const data = await response.json();
        console.log("oEmbed Data:", data);
      } else {
        console.log("oEmbed failed - video likely unavailable");
      }
    } catch (error) {
      console.error("oEmbed test failed:", error);
    }
  }
}

// Test the Yellowstone camera
const cameraId = process.argv[2] || "UCeeyw6l2cupsPbUOIBLqImQ";
testCamera(cameraId)
  .then(() => {
    console.log("\n=== Test completed ===\n");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n=== Test failed ===");
    console.error(error);
    process.exit(1);
  });
