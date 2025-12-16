import { getCameraById } from "@/lib/cameras";
import { calculateSmartSimilarity, calculateSimilarity, fetchChannelLiveCandidates } from "@/lib/youtube";
import { isCameraAvailable } from "@/lib/availability";

async function analyzeCamera48() {
  console.log("=== Analyzing Camera 48 (Iceland Volcano) ===\n");

  const camera = await getCameraById("48");
  if (!camera) {
    console.log("Camera not found");
    return;
  }

  console.log("Camera info:");
  console.log("- Name:", camera.name);
  console.log("- Current URL:", camera.sourceUrl);
  console.log("- YTB Title:", camera.ytbTitle);
  console.log("- Host Link:", camera.hostLink);
  console.log();

  if (!camera.hostLink) {
    console.log("No host link");
    return;
  }

  console.log("Fetching live candidates...");
  const candidates = await fetchChannelLiveCandidates(camera.hostLink);
  console.log(`Found ${candidates.length} live streams\n`);

  const referenceTitle = camera.ytbTitle ?? camera.name ?? "";
  console.log(`Reference title: "${referenceTitle}"\n`);

  // Test first 5 candidates
  let checkedCount = 0;
  let playableCount = 0;

  for (const live of candidates.slice(0, 10)) {
    if (!live.videoId) continue;

    checkedCount++;
    console.log(`\n${"=".repeat(70)}`);
    console.log(`Candidate ${checkedCount}: "${live.title}"`);
    console.log(`Video ID: ${live.videoId}`);

    // Check similarity first
    const basicSim = calculateSimilarity(referenceTitle, live.title ?? "");
    const smartSim = calculateSmartSimilarity(referenceTitle, live.title ?? "");

    console.log(`Similarity scores:`);
    console.log(`  Basic: ${basicSim.toFixed(3)} ${basicSim >= 0.75 ? "✅ EXACT" : "❌"}`);
    console.log(`  Smart: ${smartSim.toFixed(3)} ${smartSim >= 0.45 ? "✅ SMART" : smartSim >= 0.3 ? "⚠️ RELAXED" : "❌"}`);

    // Check if playable
    console.log(`Checking playability...`);
    const buildStub = (videoId: string, title: string) => ({
      id: videoId,
      name: title,
      embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&rel=0&playsinline=1`,
      sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
      lat: null,
      lng: null,
      timezone: null,
      city: null,
      country: null,
      tags: [],
      hostLink: null,
      ytbTitle: title,
      linkAvailable: true,
      sunsetDelay: 0,
      sunriseAdvance: 0,
      lastCheck: null,
    });

    const playable = await isCameraAvailable(buildStub(live.videoId, live.title ?? ""));

    if (playable.available) {
      console.log(`  ✅ PLAYABLE`);
      playableCount++;

      if (smartSim >= 0.3) {
        console.log(`  🎯 THIS WOULD BE A MATCH!`);
        console.log(`     Match type: ${smartSim >= 0.75 ? "EXACT" : smartSim >= 0.45 ? "SMART" : "RELAXED"}`);
      }
    } else {
      console.log(`  ❌ NOT PLAYABLE - Reason: ${playable.reason}`);
    }

    if (checkedCount >= 10) break;
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log(`Summary:`);
  console.log(`- Total candidates checked: ${checkedCount}`);
  console.log(`- Playable: ${playableCount}`);
  console.log(`- Unplayable: ${checkedCount - playableCount}`);

  if (playableCount === 0) {
    console.log(`\n❌ PROBLEM: All live streams on this channel are UNPLAYABLE!`);
    console.log(`This is a channel quality issue, not a matching algorithm issue.`);
  }
}

analyzeCamera48().catch(console.error);
