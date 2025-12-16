import { getCameraById } from "@/lib/cameras";

// 模拟 availability check 的详细步骤
async function debugCamera5Check() {
  console.log("=== Debugging Camera 5 Availability Check ===\n");

  const camera = await getCameraById("5");
  if (!camera) {
    console.log("Camera not found!");
    return;
  }

  const url = camera.sourceUrl!;
  console.log("Source URL:", url);
  console.log("\n");

  // Step 1: fetchPlayabilityStatus
  console.log("Step 1: Fetching playability status...");
  try {
    const watchUrl = `https://www.youtube.com/watch?v=Tbog9wK2bMs`;
    const response = await fetch(watchUrl, {
      method: "GET",
      headers: {
        "User-Agent": "SunsetEarth/1.0 availability",
      },
      cache: "no-store",
    });

    console.log("  Response status:", response.ok ? "OK" : `Failed (${response.status})`);

    if (response.ok) {
      const html = await response.text();
      const match = html.match(/ytInitialPlayerResponse\s*=\s*(\{[\s\S]+?\})\s*;/);

      if (match) {
        try {
          const data = JSON.parse(match[1]);
          const playabilityStatus = data.playabilityStatus?.status;
          console.log("  Playability status:", playabilityStatus ?? "null");

          // 关键检查点
          if (playabilityStatus && playabilityStatus !== "OK") {
            console.log("  ❌ Video is UNPLAYABLE");
            console.log("  Should return: { available: false, reason: 'playability_blocked' }");
          } else if (!playabilityStatus) {
            console.log("  ⚠️  Playability status is null");
            console.log("  Will continue to next checks...");
          } else {
            console.log("  ✅ Video playability is OK");
          }
        } catch (parseError) {
          console.log("  ⚠️  Failed to parse ytInitialPlayerResponse");
          console.log("  Returns null, will continue to next checks...");
        }
      } else {
        console.log("  ⚠️  No ytInitialPlayerResponse found in HTML");
        console.log("  Returns null, will continue to next checks...");
      }
    } else {
      console.log("  ⚠️  Fetch failed");
      console.log("  Returns null, will continue to next checks...");
    }
  } catch (error) {
    console.log("  ❌ Exception:", error);
    console.log("  Returns null, will continue to next checks...");
  }

  console.log("\n");

  // Step 2: Check oembed
  console.log("Step 2: Checking oembed...");
  try {
    const watchUrl = `https://www.youtube.com/watch?v=Tbog9wK2bMs`;
    const oembedUrl = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl)}`;
    const oembedResponse = await fetch(oembedUrl, {
      method: "GET",
      headers: {
        "User-Agent": "SunsetEarth/1.0 availability",
      },
      cache: "no-store",
    });

    console.log("  oEmbed status:", oembedResponse.status);

    if (!oembedResponse.ok) {
      const reason = oembedResponse.status === 401 || oembedResponse.status === 403
        ? "oembed_forbidden"
        : "oembed_error";
      console.log("  ❌ oEmbed failed, reason:", reason);
      console.log("  Should return: { available: false, reason:", reason, "}");
    } else {
      console.log("  ✅ oEmbed check passed");
    }
  } catch (error) {
    console.log("  ❌ oEmbed exception:", error);
  }

  console.log("\n");

  // Step 3: Check embed URL
  console.log("Step 3: Checking embed URL...");
  try {
    const embedUrl = `https://www.youtube.com/embed/Tbog9wK2bMs`;
    const response = await fetch(embedUrl, {
      method: "GET",
      headers: {
        "User-Agent": "SunsetEarth/1.0 availability",
      },
      cache: "no-store",
      redirect: "follow",
    });

    console.log("  Embed fetch status:", response.status);

    if (!response.ok) {
      const reason = response.status === 404 ? "not_found" : "fetch_error";
      console.log("  ❌ Embed fetch failed, reason:", reason);
    } else {
      console.log("  ✅ Embed fetch succeeded");
      const html = await response.text();

      // Check for unavailable phrases
      const unavailablePhrases = [
        "This live stream recording is not available",
        "This live event is no longer available",
        "Video unavailable",
        "Private video",
        "Playback on other websites has been disabled",
      ];

      const foundPhrase = unavailablePhrases.find(phrase => html.includes(phrase));
      if (foundPhrase) {
        console.log("  ❌ Found unavailable phrase:", foundPhrase);
        console.log("  Should return: { available: false, reason: 'unavailable_text' }");
      } else {
        console.log("  ⚠️  No unavailable phrases found in embed HTML");
        console.log("  Would return: { available: true, reason: 'ok' }");
      }
    }
  } catch (error) {
    console.log("  ❌ Embed check exception:", error);
    console.log("  This exception would be caught by outer try-catch");
    console.log("  Would return: { available: true, reason: 'error' }");
  }
}

debugCamera5Check().catch(console.error);
