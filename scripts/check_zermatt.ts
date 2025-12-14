import { supabaseAdmin } from "../lib/supabaseAdmin";

async function checkZermatt() {
  // Search for Zermatt camera
  const { data, error } = await supabaseAdmin
    .from("camera_ytb")
    .select("*")
    .ilike("placename", "%Zermatt%");

  if (error) {
    console.error("Error:", error);
    return;
  }

  if (!data || data.length === 0) {
    console.log("No Zermatt camera found");
    return;
  }

  for (const camera of data) {
    console.log("=".repeat(70));
    console.log("Camera Details:");
    console.log("=".repeat(70));
    console.log("ID:", camera.camera_id);
    console.log("Placename:", camera.placename);
    console.log("Link:", camera.link);
    console.log("City:", camera.city);
    console.log("Country:", camera.country);
    console.log("Tags:", camera.tag);
    console.log("Link Available:", camera.link_available);
    console.log("Last Check:", camera.last_check);
    console.log("\nYouTube Title:", camera.ytb_title);
    console.log();
  }
}

checkZermatt();
