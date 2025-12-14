import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const url =
      request.nextUrl.searchParams.get("url") ||
      "https://www.youtube.com/embed/UCeeyw6l2cupsPbUOIBLqImQ";

    console.log(`\n=== Testing YouTube URL: ${url} ===\n`);

    const results: any = {
      url,
      tests: {},
    };

    // Test 1: Fetch the embed page
    console.log("\n--- Test 1: Fetch embed page ---");
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; SunsetEarth/1.0)",
          Cookie: "CONSENT=YES+cb",
        },
        cache: "no-store",
        redirect: "follow",
      });

      console.log("Status:", response.status);

      const htmlTest: any = {
        status: response.status,
        statusText: response.statusText,
        phrasesFound: [],
        playerResponse: null,
        htmlSnippets: [],
      };

      if (response.ok) {
        const html = await response.text();

        // Check for specific unavailable phrases
        const phrases = [
          "This live stream recording is not available",
          "This live event is no longer available",
          "Video unavailable",
          "Private video",
          "Playback on other websites has been disabled",
          "has been removed by the uploader",
        ];

        phrases.forEach((phrase) => {
          if (html.includes(phrase)) {
            htmlTest.phrasesFound.push(phrase);
            console.log(`  ✓ FOUND: "${phrase}"`);

            // Extract surrounding context
            const index = html.indexOf(phrase);
            if (index !== -1) {
              const snippet = html.substring(
                Math.max(0, index - 100),
                Math.min(html.length, index + phrase.length + 100)
              );
              htmlTest.htmlSnippets.push(snippet);
            }
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
              messages: playerData.playabilityStatus?.messages,
              errorScreen: playerData.playabilityStatus?.errorScreen
                ? "present"
                : "absent",
            };
            console.log("\nPlayer Response:", htmlTest.playerResponse);
          } catch (e: any) {
            console.log("Failed to parse ytInitialPlayerResponse:", e.message);
            htmlTest.playerResponse = { error: "parse_failed" };
          }
        } else {
          console.log("\nNo ytInitialPlayerResponse found");

          // Try to find any player-related data
          const varMatch = html.match(/var\s+ytInitialData\s*=\s*({[\s\S]+?});/);
          if (varMatch) {
            htmlTest.playerResponse = { ytInitialData: "found" };
          } else {
            htmlTest.playerResponse = { error: "not_found" };
          }
        }

        // Save a small snippet of HTML for debugging
        htmlTest.htmlLength = html.length;
        htmlTest.titleMatch = html.match(/<title>(.{0,200})<\/title>/)?.[1];
      }

      results.tests.embedFetch = htmlTest;
    } catch (error: any) {
      console.error("Embed fetch failed:", error);
      results.tests.embedFetch = { error: error.message };
    }

    // Test 2: Try to extract video ID and test watch page
    console.log("\n--- Test 2: Test watch page ---");
    const videoIdMatch = url.match(/embed\/([^?&/]+)/);
    if (videoIdMatch) {
      const videoId = videoIdMatch[1];
      const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;

      try {
        const response = await fetch(watchUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; SunsetEarth/1.0)",
            Cookie: "CONSENT=YES+cb",
          },
          cache: "no-store",
        });

        const watchTest: any = {
          videoId,
          watchUrl,
          status: response.status,
        };

        if (response.ok) {
          const html = await response.text();

          // Check playability in watch page
          const playerMatch = html.match(
            /ytInitialPlayerResponse\s*=\s*(\{[\s\S]+?\})\s*;/
          );
          if (playerMatch) {
            try {
              const playerData = JSON.parse(playerMatch[1]);
              watchTest.playabilityStatus = {
                status: playerData.playabilityStatus?.status,
                reason: playerData.playabilityStatus?.reason,
                messages: playerData.playabilityStatus?.messages,
              };
            } catch (e) {
              watchTest.playabilityStatus = { error: "parse_failed" };
            }
          }
        }

        results.tests.watchPage = watchTest;
      } catch (error: any) {
        results.tests.watchPage = { error: error.message };
      }
    }

    // Test 3: oEmbed API
    console.log("\n--- Test 3: oEmbed API ---");
    if (videoIdMatch) {
      const videoId = videoIdMatch[1];
      const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const oembedUrl = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(
        watchUrl
      )}`;

      try {
        const response = await fetch(oembedUrl, {
          headers: {
            "User-Agent": "SunsetEarth/1.0 availability",
          },
        });

        const oembedTest: any = {
          url: oembedUrl,
          status: response.status,
        };

        if (response.ok) {
          const data = await response.json();
          oembedTest.data = data;
        } else {
          oembedTest.error = `HTTP ${response.status}`;
        }

        results.tests.oembed = oembedTest;
      } catch (error: any) {
        results.tests.oembed = { error: error.message };
      }
    }

    console.log("\n=== Test completed ===\n");
    return NextResponse.json(results, {
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error: any) {
    console.error("Test failed:", error);
    return NextResponse.json(
      { error: "Test failed", message: error.message },
      { status: 500 }
    );
  }
}
