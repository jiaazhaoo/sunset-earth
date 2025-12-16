import { getCameraById } from "@/lib/cameras";
import { isCameraAvailable } from "@/lib/availability";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

async function manualRefreshCamera5() {
  console.log("Manually refreshing camera ID 5...\n");

  const camera = await getCameraById("5");
  if (!camera) {
    console.log("Camera not found!");
    return;
  }

  console.log("Current state:");
  console.log("- Name:", camera.name);
  console.log("- Source URL:", camera.sourceUrl);
  console.log("- Link Available:", camera.linkAvailable);
  console.log("- Last Check:", camera.lastCheck);
  console.log("\n");

  console.log("Checking availability...");
  const availability = await isCameraAvailable(camera);
  console.log("Availability result:", availability);
  console.log("\n");

  if (availability.available) {
    console.log("Camera is available, updating database...");
    const updates: Record<string, unknown> = {
      last_check: new Date().toISOString(),
    };
    if (!camera.linkAvailable) {
      updates.link_available = true;
      console.log("Marking as available");
    }

    const { error } = await supabaseAdmin
      .from("camera_ytb")
      .update(updates)
      .eq("camera_id", camera.id);

    if (error) {
      console.error("Update error:", error);
    } else {
      console.log("✅ Updated successfully");
    }
  } else {
    console.log("Camera is unavailable, marking as unavailable...");
    const { error } = await supabaseAdmin
      .from("camera_ytb")
      .update({
        link_available: false,
        last_check: new Date().toISOString(),
      })
      .eq("camera_id", camera.id);

    if (error) {
      console.error("Update error:", error);
    } else {
      console.log("✅ Marked as unavailable");
    }
  }

  // Verify update
  console.log("\nVerifying update...");
  const updatedCamera = await getCameraById("5");
  if (updatedCamera) {
    console.log("New state:");
    console.log("- Link Available:", updatedCamera.linkAvailable);
    console.log("- Last Check:", updatedCamera.lastCheck);
  }
}

manualRefreshCamera5().catch(console.error);
