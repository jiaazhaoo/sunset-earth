import { getCameraById } from "@/lib/cameras";
import { isCameraAvailable } from "@/lib/availability";

async function checkCamera48Status() {
  console.log("=== Checking Camera 48 Current Status ===\n");

  const camera = await getCameraById("48");
  if (!camera) {
    console.log("Camera not found");
    return;
  }

  console.log("Camera info:");
  console.log("- ID:", camera.id);
  console.log("- Name:", camera.name);
  console.log("- Current URL:", camera.sourceUrl);
  console.log("- YTB Title:", camera.ytbTitle);
  console.log("- DB link_available:", camera.linkAvailable);
  console.log("- Last check:", camera.lastCheck);
  console.log();

  console.log("Testing current video availability...");
  const result = await isCameraAvailable(camera);

  console.log("\nAvailability check result:");
  console.log("- Available:", result.available);
  console.log("- Reason:", result.reason);
  console.log();

  console.log("=== Analysis ===");
  if (!result.available && camera.linkAvailable) {
    console.log("❌ PROBLEM FOUND!");
    console.log("   Database says: link_available = true");
    console.log("   Reality check says: available = false");
    console.log("   Reason: " + result.reason);
    console.log();
    console.log("This camera should have been marked as unavailable by refresh-links cron!");
    console.log("Possible reasons:");
    console.log("1. Cron didn't run yet after your fix");
    console.log("2. Video became unavailable AFTER the last cron run");
    console.log("3. There was an error during the cron run for this specific camera");
  } else if (!result.available && !camera.linkAvailable) {
    console.log("✅ CORRECT!");
    console.log("   Database correctly shows: link_available = false");
    console.log("   Check confirms: available = false");
  } else if (result.available && !camera.linkAvailable) {
    console.log("⚠️ STALE DATA!");
    console.log("   Database shows: link_available = false (old)");
    console.log("   But video is actually available now");
    console.log("   Should be updated to true");
  } else {
    console.log("✅ Everything is fine");
  }
}

checkCamera48Status().catch(console.error);
