import { getCameraById } from "@/lib/cameras";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

async function checkCamera5() {
  console.log("Checking camera ID 5...\n");

  // Get camera data
  const camera = await getCameraById("5");

  if (!camera) {
    console.log("Camera 5 not found!");
    return;
  }

  console.log("Camera data:");
  console.log("- ID:", camera.id);
  console.log("- Name:", camera.name);
  console.log("- Source URL:", camera.sourceUrl);
  console.log("- Embed URL:", camera.embedUrl);
  console.log("- Link Available:", camera.linkAvailable);
  console.log("- Last Check:", camera.lastCheck);
  console.log("- Host Link:", camera.hostLink);
  console.log("- YTB Title:", camera.ytbTitle);
  console.log("\n");

  // Get raw database record
  const { data: rawData, error } = await supabaseAdmin
    .from("camera_ytb")
    .select("*")
    .eq("camera_id", 5)
    .single();

  if (error) {
    console.error("Database error:", error);
    return;
  }

  console.log("Raw database record:");
  console.log(JSON.stringify(rawData, null, 2));
}

checkCamera5().catch(console.error);
