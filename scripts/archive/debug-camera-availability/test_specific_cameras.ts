import { getCameraById } from "@/lib/cameras";
import { isCameraAvailable } from "@/lib/availability";

async function testSpecificCameras() {
  console.log("=== Testing Specific Cameras ===\n");

  // Test camera 5 (known UNPLAYABLE)
  console.log("1. Testing Camera 5 (Known UNPLAYABLE):");
  const camera5 = await getCameraById("5");
  if (camera5) {
    const result5 = await isCameraAvailable(camera5);
    console.log(`   URL: ${camera5.sourceUrl}`);
    console.log(`   Result: ${result5.available ? "✅ Available" : "❌ Unavailable"} (${result5.reason})`);
  }
  console.log();

  // Test a few random cameras
  const testIds = ["32", "24", "38"];
  for (const id of testIds) {
    console.log(`Testing Camera ${id}:`);
    const camera = await getCameraById(id);
    if (camera) {
      const result = await isCameraAvailable(camera);
      console.log(`   Name: ${camera.name}`);
      console.log(`   URL: ${camera.sourceUrl}`);
      console.log(`   DB linkAvailable: ${camera.linkAvailable}`);
      console.log(`   Check result: ${result.available ? "✅ Available" : "❌ Unavailable"} (${result.reason})`);

      if (camera.linkAvailable !== result.available) {
        console.log(`   ⚠️  MISMATCH! DB says ${camera.linkAvailable}, check says ${result.available}`);
      }
    }
    console.log();
  }

  // Test fetching embed HTML directly to see what phrases are in it
  console.log("Direct embed HTML test for Camera 32:");
  const camera32 = await getCameraById("32");
  if (camera32) {
    try {
      const response = await fetch(camera32.embedUrl, {
        method: "GET",
        headers: { "User-Agent": "SunsetEarth/1.0" },
        cache: "no-store",
      });

      if (response.ok) {
        const html = await response.text();
        console.log(`   HTML length: ${html.length}`);
        console.log(`   Contains "UNPLAYABLE": ${html.includes("UNPLAYABLE")}`);
        console.log(`   Contains '"status":"UNPLAYABLE"': ${html.includes('"status":"UNPLAYABLE"')}`);
        console.log(`   Contains "player-unavailable": ${html.includes("player-unavailable")}`);
        console.log(`   Contains "An error occurred": ${html.includes("An error occurred")}`);
      }
    } catch (error) {
      console.log(`   Error fetching: ${error}`);
    }
  }
}

testSpecificCameras().catch(console.error);
