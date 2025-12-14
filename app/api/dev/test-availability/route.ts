import { NextRequest, NextResponse } from "next/server";
import { getCameraById } from "@/lib/cameras";
import { isCameraAvailable } from "@/lib/availability";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const cameraId = request.nextUrl.searchParams.get("cameraId");
    if (!cameraId) {
      return NextResponse.json(
        { error: "Missing cameraId parameter" },
        { status: 400 }
      );
    }

    console.log(`\n=== Testing Camera: ${cameraId} ===\n`);

    // 1. Get camera from database
    const camera = await getCameraById(cameraId);
    if (!camera) {
      return NextResponse.json(
        { error: "Camera not found in database" },
        { status: 404 }
      );
    }

    const results: any = {
      camera: {
        name: camera.name,
        sourceUrl: camera.sourceUrl,
        embedUrl: camera.embedUrl,
        linkAvailable: camera.linkAvailable,
        lastCheck: camera.lastCheck,
      },
      tests: {},
    };

    // 2. Test availability detection WITHOUT consent cookie
    console.log("\n--- Test 1: Without consent cookie ---");
    const result1 = await isCameraAvailable(camera, { withConsent: false });
    console.log("Result:", result1);
    results.tests.withoutConsent = result1;

    // 3. Test availability detection WITH consent cookie
    console.log("\n--- Test 2: With consent cookie ---");
    const result2 = await isCameraAvailable(camera, { withConsent: true });
    console.log("Result:", result2);
    results.tests.withConsent = result2;

    // 4. Detailed HTML fetch test
    console.log("\n--- Test 3: Direct HTML fetch ---");
    if (camera.embedUrl) {
      try {
        const response = await fetch(camera.embedUrl, {
          headers: {
            "User-Agent": "SunsetEarth/1.0 availability",
            Cookie: "CONSENT=YES+cb",
          },
          cache: "no-store",
        });

        console.log("Status:", response.status);
        console.log("Status Text:", response.statusText);

        const htmlTest: any = {
          status: response.status,
          statusText: response.statusText,
          phrasesFound: [],
          playerResponse: null,
        };

        if (response.ok) {
          const html = await response.text();

          // Check for specific phrases
          const phrases = [
            "This live stream recording is not available",
            "This live event is no longer available",
            "Video unavailable",
            "Private video",
            "Playback on other websites has been disabled",
          ];

          phrases.forEach((phrase) => {
            if (html.includes(phrase)) {
              htmlTest.phrasesFound.push(phrase);
              console.log(`  ✓ FOUND: "${phrase}"`);
            }
          });

          // Check ytInitialPlayerResponse
          const playerMatch = html.match(
            /ytInitialPlayerResponse\s*=\s*(\{[\s\S]+?\})\s*;/
          );
          if (playerMatch) {
            try {
              const playerData = JSON.parse(playerMatch[1]);
              htmlTest.playerResponse = {
                status: playerData.playabilityStatus?.status,
                reason: playerData.playabilityStatus?.reason,
                errorScreen: playerData.playabilityStatus?.errorScreen,
              };
              console.log("\nPlayer Response:", htmlTest.playerResponse);
            } catch (e) {
              console.log("Failed to parse ytInitialPlayerResponse");
              htmlTest.playerResponse = "parse_failed";
            }
          } else {
            console.log("\nNo ytInitialPlayerResponse found");
            htmlTest.playerResponse = "not_found";
          }
        }

        results.tests.htmlFetch = htmlTest;
      } catch (error: any) {
        console.error("Fetch failed:", error);
        results.tests.htmlFetch = { error: error.message };
      }
    }

    // 5. Test oEmbed API
    console.log("\n--- Test 4: YouTube oEmbed API ---");
    if (camera.sourceUrl) {
      try {
        const oembedUrl = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(
          camera.sourceUrl
        )}`;
        const response = await fetch(oembedUrl, {
          headers: {
            "User-Agent": "SunsetEarth/1.0 availability",
          },
        });

        console.log("oEmbed Status:", response.status);
        const oembedTest: any = {
          status: response.status,
        };

        if (response.ok) {
          const data = await response.json();
          console.log("oEmbed Data:", data);
          oembedTest.data = data;
        } else {
          console.log("oEmbed failed - video likely unavailable");
          oembedTest.failed = true;
        }

        results.tests.oembed = oembedTest;
      } catch (error: any) {
        console.error("oEmbed test failed:", error);
        results.tests.oembed = { error: error.message };
      }
    }

    return NextResponse.json(results);
  } catch (error: any) {
    console.error("Test failed:", error);
    return NextResponse.json(
      { error: "Test failed", message: error.message },
      { status: 500 }
    );
  }
}
