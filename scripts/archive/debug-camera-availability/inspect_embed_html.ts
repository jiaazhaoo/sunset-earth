async function inspectEmbedHTML() {
  console.log("=== Inspecting Embed HTML for UNPLAYABLE video ===\n");

  const embedUrl = `https://www.youtube.com/embed/Tbog9wK2bMs`;

  const response = await fetch(embedUrl, {
    method: "GET",
    headers: {
      "User-Agent": "SunsetEarth/1.0 availability",
    },
    cache: "no-store",
    redirect: "follow",
  });

  if (!response.ok) {
    console.log("Failed to fetch:", response.status);
    return;
  }

  const html = await response.text();

  // Search for player response patterns
  console.log("Searching for player response patterns...\n");

  // Pattern 1: ytInitialPlayerResponse
  const pattern1 = /ytInitialPlayerResponse\s*=\s*(\{[^;]+\});/;
  const match1 = html.match(pattern1);
  if (match1) {
    console.log("✅ Found ytInitialPlayerResponse (pattern 1)");
    const snippet = match1[0].substring(0, 200) + "...";
    console.log("Snippet:", snippet);
  } else {
    console.log("❌ Pattern 1 not found");
  }

  // Pattern 2: var ytInitialPlayerResponse
  const pattern2 = /var\s+ytInitialPlayerResponse\s*=\s*\{/;
  if (pattern2.test(html)) {
    console.log("✅ Found var ytInitialPlayerResponse (pattern 2)");
  } else {
    console.log("❌ Pattern 2 not found");
  }

  // Pattern 3: Search for playabilityStatus anywhere
  if (html.includes("playabilityStatus")) {
    console.log("✅ Found 'playabilityStatus' in HTML");

    // Extract context around it
    const index = html.indexOf("playabilityStatus");
    const context = html.substring(Math.max(0, index - 50), Math.min(html.length, index + 300));
    console.log("\nContext:");
    console.log(context);
  } else {
    console.log("❌ 'playabilityStatus' not found anywhere in HTML");
  }

  // Pattern 4: Search for UNPLAYABLE
  if (html.includes("UNPLAYABLE")) {
    console.log("\n✅ Found 'UNPLAYABLE' in HTML");
    const index = html.indexOf("UNPLAYABLE");
    const context = html.substring(Math.max(0, index - 100), Math.min(html.length, index + 100));
    console.log("\nContext:");
    console.log(context);
  } else {
    console.log("\n❌ 'UNPLAYABLE' not found in HTML");
  }

  // Pattern 5: Check for player error messages
  const errorPatterns = [
    "playability",
    "error",
    "unavailable",
    "status",
    "UNPLAYABLE",
    "reason",
  ];

  console.log("\n\nSearching for error-related keywords:");
  for (const keyword of errorPatterns) {
    const count = (html.match(new RegExp(keyword, "gi")) || []).length;
    if (count > 0) {
      console.log(`  ${keyword}: ${count} occurrences`);
    }
  }

  // Save a sample to file for manual inspection
  console.log("\n\nHTML sample (first 2000 chars):");
  console.log(html.substring(0, 2000));
}

inspectEmbedHTML().catch(console.error);
