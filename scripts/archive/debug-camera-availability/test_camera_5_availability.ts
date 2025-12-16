import { getCameraById } from "@/lib/cameras";
import { isCameraAvailable } from "@/lib/availability";

async function testCamera5() {
  console.log("Testing camera ID 5 availability...\n");

  const camera = await getCameraById("5");
  if (!camera) {
    console.log("Camera not found!");
    return;
  }

  console.log("Camera:", camera.name);
  console.log("Source URL:", camera.sourceUrl);
  console.log("Current linkAvailable:", camera.linkAvailable);
  console.log("Last check:", camera.lastCheck);
  console.log("\n");

  console.log("Testing availability with withConsent=false...");
  const result1 = await isCameraAvailable(camera, { withConsent: false });
  console.log("Result:", result1);
  console.log("\n");

  console.log("Testing availability with withConsent=true...");
  const result2 = await isCameraAvailable(camera, { withConsent: true });
  console.log("Result:", result2);
  console.log("\n");

  // Test the video URL directly
  const videoId = "Tbog9wK2bMs";
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const oembedUrl = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl)}`;

  console.log("Testing oembed endpoint...");
  try {
    const oembedResponse = await fetch(oembedUrl);
    console.log("Status:", oembedResponse.status);
    if (oembedResponse.ok) {
      const oembedData = await oembedResponse.json();
      console.log("oEmbed data:", JSON.stringify(oembedData, null, 2));
    } else {
      console.log("Failed with status:", oembedResponse.status);
    }
  } catch (err) {
    console.error("oEmbed error:", err);
  }
}

testCamera5().catch(console.error);
