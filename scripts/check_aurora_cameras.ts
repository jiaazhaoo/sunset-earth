import { supabaseAdmin } from "../lib/supabaseAdmin";

async function checkAuroraCameras() {
  // Check camera 123
  const { data: cam123 } = await supabaseAdmin
    .from("camera_ytb")
    .select("camera_id, placename, tag, city, country")
    .eq("camera_id", "123")
    .single();

  console.log("Camera 123:");
  console.log(cam123);

  // Find all aurora cameras
  const { data: auroraCams } = await supabaseAdmin
    .from("camera_ytb")
    .select("camera_id, placename, tag, city, country")
    .or("tag.ilike.%Aurora%,placename.ilike.%Aurora%");

  console.log("\nAll Aurora cameras:");
  console.log(auroraCams);
}

checkAuroraCameras();
