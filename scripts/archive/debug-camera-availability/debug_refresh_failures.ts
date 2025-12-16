import { getCameraById } from "@/lib/cameras";
import { refreshCamera } from "@/lib/cameraRefresh";
import { fetchChannelLiveCandidates } from "@/lib/youtube";

async function debugRefreshFailures() {
  console.log("=== Debugging Refresh Failures ===\n");

  // Check the unavailable cameras from the cron result
  const unavailableCameras = [5, 48, 65, 73, 87];

  for (const id of unavailableCameras) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Camera ${id}`);
    console.log("=".repeat(60));

    const camera = await getCameraById(String(id));
    if (!camera) {
      console.log("❌ Camera not found in database");
      continue;
    }

    console.log(`Name: ${camera.name}`);
    console.log(`Current URL: ${camera.sourceUrl}`);
    console.log(`Host Link: ${camera.hostLink || "❌ No host link"}`);
    console.log(`YTB Title: ${camera.ytbTitle || "N/A"}`);
    console.log();

    if (!camera.hostLink) {
      console.log("❌ Cannot refresh: No host_link defined");
      continue;
    }

    // Step 1: Check what live streams are available on the channel
    console.log("Step 1: Fetching live candidates from channel...");
    try {
      const candidates = await fetchChannelLiveCandidates(camera.hostLink);
      console.log(`Found ${candidates.length} live streams on channel`);

      if (candidates.length === 0) {
        console.log("❌ No live streams currently available on this channel");
        continue;
      }

      console.log("\nLive streams found:");
      for (let i = 0; i < Math.min(candidates.length, 5); i++) {
        const live = candidates[i];
        console.log(`  ${i + 1}. ${live.title || "No title"}`);
        console.log(`     Video ID: ${live.videoId}`);
      }

      // Step 2: Try refresh
      console.log("\nStep 2: Attempting refresh...");
      const result = await refreshCamera(camera);

      console.log("\nRefresh result:");
      if (result.updated) {
        console.log("✅ Successfully found replacement!");
        console.log(`New URL: ${result.camera?.sourceUrl}`);
        console.log(`Similarity: ${result.similarity}`);
      } else {
        console.log("❌ Failed to find suitable replacement");
        console.log(`Reason: ${result.reason}`);

        if (result.reason === "no-playable") {
          console.log("\nDetailed analysis:");
          console.log("This means all live streams on the channel were:");
          console.log("- Either the same as current video ID");
          console.log("- Or not playable/available");
          console.log("- Or title similarity < 0.75");
        }
      }
    } catch (error) {
      console.log("❌ Error during refresh:", error);
    }
  }
}

debugRefreshFailures().catch(console.error);
