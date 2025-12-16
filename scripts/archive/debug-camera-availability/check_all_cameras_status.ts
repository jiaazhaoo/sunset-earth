import { listCameras } from "@/lib/cameras";
import { isCameraAvailable } from "@/lib/availability";

async function checkAllCameras() {
  console.log("=== Checking All Cameras Status ===\n");

  const cameras = await listCameras(50, 0);
  console.log(`Total cameras to check: ${cameras.length}\n`);

  let availableCount = 0;
  let unavailableCount = 0;
  const reasons: Record<string, number> = {};
  const samples: Array<{
    id: string;
    name: string;
    linkAvailable: boolean;
    checkResult: any;
  }> = [];

  for (const camera of cameras.slice(0, 10)) {  // Check first 10 for speed
    console.log(`Checking ${camera.id}: ${camera.name}...`);

    try {
      const result = await isCameraAvailable(camera);

      if (result.available) {
        availableCount++;
        console.log(`  ✅ Available (${result.reason})`);
      } else {
        unavailableCount++;
        console.log(`  ❌ Unavailable (${result.reason})`);
        reasons[result.reason] = (reasons[result.reason] || 0) + 1;
      }

      samples.push({
        id: camera.id,
        name: camera.name,
        linkAvailable: camera.linkAvailable,
        checkResult: result,
      });
    } catch (error) {
      console.log(`  ⚠️  Error:`, error);
    }
  }

  console.log("\n=== Summary ===");
  console.log(`Available: ${availableCount}`);
  console.log(`Unavailable: ${unavailableCount}`);
  console.log(`Percentage unavailable: ${((unavailableCount / (availableCount + unavailableCount)) * 100).toFixed(1)}%`);

  console.log("\nUnavailable reasons:");
  for (const [reason, count] of Object.entries(reasons)) {
    console.log(`  ${reason}: ${count}`);
  }

  console.log("\nSample results:");
  for (const sample of samples.slice(0, 5)) {
    console.log(`  ${sample.id} (${sample.name}): DB=${sample.linkAvailable}, Check=${sample.checkResult.available} (${sample.checkResult.reason})`);
  }
}

checkAllCameras().catch(console.error);
