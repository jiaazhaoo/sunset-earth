import { getCameraById } from "@/lib/cameras";
import { isCameraAvailable } from "@/lib/availability";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

async function forceUpdateCamera48() {
  console.log("=== Force Update Camera 48 ===\n");

  const camera = await getCameraById("48");
  if (!camera) {
    console.log("Camera not found");
    return;
  }

  console.log("Current state:");
  console.log("- link_available:", camera.linkAvailable);
  console.log("- last_check:", camera.lastCheck);
  console.log();

  console.log("Checking actual availability...");
  const result = await isCameraAvailable(camera);
  console.log("Result:", result);
  console.log();

  if (!result.available && camera.linkAvailable) {
    console.log("❌ Mismatch detected! Updating database...");

    const { error } = await supabaseAdmin
      .from("camera_ytb")
      .update({
        link_available: false,
        last_check: new Date().toISOString(),
      })
      .eq("camera_id", "48");

    if (error) {
      console.error("Update error:", error);
    } else {
      console.log("✅ Successfully updated to link_available = false");

      // Verify
      const updated = await getCameraById("48");
      console.log("\nVerified:");
      console.log("- link_available:", updated?.linkAvailable);
      console.log("- last_check:", updated?.lastCheck);
    }
  } else if (!result.available && !camera.linkAvailable) {
    console.log("✅ Already correctly marked as unavailable");
  } else {
    console.log("ℹ️  Camera is available, no update needed");
  }
}

forceUpdateCamera48().catch(console.error);
