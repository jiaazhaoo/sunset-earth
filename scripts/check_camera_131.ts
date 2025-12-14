import { supabaseAdmin } from "../lib/supabaseAdmin";

async function checkCamera131() {
  const { data, error } = await supabaseAdmin
    .from("camera_ytb")
    .select("*")
    .eq("camera_id", "131")
    .single();

  if (error) {
    console.error("Error:", error);
    return;
  }

  console.log("Camera 131 Details:");
  console.log("==================");
  console.log("ID:", data.camera_id);
  console.log("Placename:", data.placename);
  console.log("Link:", data.link);
  console.log("City:", data.city);
  console.log("Country:", data.country);
  console.log("Tags:", data.tag);
  console.log("Link Available:", data.link_available);
  console.log("Last Check:", data.last_check);
  console.log("\nYouTube Title:", data.ytb_title);
}

checkCamera131();
