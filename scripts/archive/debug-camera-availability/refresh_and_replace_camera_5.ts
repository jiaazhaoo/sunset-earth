import { getCameraById } from "@/lib/cameras";
import { refreshCamera } from "@/lib/cameraRefresh";

async function refreshAndReplaceCamera5() {
  console.log("Attempting to refresh camera ID 5 with new link...\n");

  const camera = await getCameraById("5");
  if (!camera) {
    console.log("Camera not found!");
    return;
  }

  console.log("Current state:");
  console.log("- Name:", camera.name);
  console.log("- Source URL:", camera.sourceUrl);
  console.log("- Link Available:", camera.linkAvailable);
  console.log("- Host Link:", camera.hostLink);
  console.log("- YTB Title:", camera.ytbTitle);
  console.log("\n");

  if (!camera.hostLink) {
    console.log("❌ No host link found, cannot refresh");
    return;
  }

  console.log("Searching for new live streams from host channel...");
  const result = await refreshCamera(camera);

  console.log("\nRefresh result:");
  console.log(JSON.stringify(result, null, 2));

  if (result.updated && result.camera) {
    console.log("\n✅ Successfully updated camera!");
    console.log("New source URL:", result.camera.sourceUrl);
    console.log("New title:", result.camera.ytbTitle);
    console.log("Similarity:", result.similarity);
  } else {
    console.log("\n❌ Failed to find a suitable replacement");
    console.log("Reason:", result.reason);
  }
}

refreshAndReplaceCamera5().catch(console.error);
