import { supabaseAdmin } from "@/lib/supabaseAdmin";

async function verifyCompletion() {
  const { data, error } = await supabaseAdmin
    .from("camera_ytb")
    .select("camera_id, placename, city, country, latitude, longitude, timezone, tag")
    .gte("camera_id", "132")
    .order("camera_id");

  if (error) {
    console.error("Error:", error);
    return;
  }

  console.log("Verification of newly added cameras (132-172):\n");

  let complete = 0;
  let incomplete = 0;

  data?.forEach((cam) => {
    const hasAllFields =
      cam.city &&
      cam.country &&
      cam.latitude !== null &&
      cam.longitude !== null &&
      cam.timezone &&
      cam.tag;

    if (hasAllFields) {
      complete++;
      console.log(`✅ Camera ${cam.camera_id}: ${cam.placename || cam.city}`);
      console.log(`   📍 ${cam.city}, ${cam.country}`);
      console.log(`   🌐 ${cam.latitude}, ${cam.longitude}`);
      console.log(`   🏷️  ${cam.tag}`);
      console.log();
    } else {
      incomplete++;
      console.log(`❌ Camera ${cam.camera_id}: Missing fields`);
    }
  });

  console.log("=".repeat(70));
  console.log("Summary:");
  console.log(`- Complete: ${complete}/${data.length}`);
  console.log(`- Incomplete: ${incomplete}/${data.length}`);

  if (complete === data.length) {
    console.log("\n🎉 All cameras have complete information!");
  }
}

verifyCompletion().catch(console.error);
