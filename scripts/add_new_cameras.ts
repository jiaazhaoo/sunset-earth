import { supabaseAdmin } from "@/lib/supabaseAdmin";

const newLinks = [
  "https://www.youtube.com/watch?v=R1CsP-10I7U",
  "https://www.youtube.com/watch?v=qYRdGZ1jSjo",
  "https://www.youtube.com/watch?v=gCu45mPX77Y",
  "https://www.youtube.com/watch?v=zPfCPHQZvpw",
  "https://www.youtube.com/watch?v=ahSMyLJcp48",
  "https://www.youtube.com/watch?v=1ksmiy6EsDo",
  "https://www.youtube.com/watch?v=GLAmYBCocFo",
  "https://www.youtube.com/watch?v=DnrgCsF1nAM&list=PLxtg5zfgORZr8KB1VglBvI6czMJpPL-rx&index=13",
  "https://www.youtube.com/watch?v=Kg1Q-47xGJQ&list=PLxtg5zfgORZr8KB1VglBvI6czMJpPL-rx&index=15",
  "https://www.youtube.com/watch?v=bAGEydkcGXg",
  "https://www.youtube.com/watch?v=6YuIquNmb2E",
  "https://www.youtube.com/watch?v=PoZ1Hy7PQig",
  "https://www.youtube.com/watch?v=8hNS4PRbKFM",
  "https://www.youtube.com/watch?v=HERP-WFHLCM",
  "https://www.youtube.com/watch?v=lIXF-2kyWDk",
  "https://www.youtube.com/watch?v=oE2N7RjfRPY",
  "https://www.youtube.com/watch?v=b_juZ93jVkA",
  "https://www.youtube.com/watch?v=2XptTNJC0ZU",
  "https://www.youtube.com/watch?v=nKWD6ig9JXk",
  "https://www.youtube.com/watch?v=lG6DOM82GbQ",
  "https://www.youtube.com/watch?v=wuPEBUNnATE",
  "https://www.youtube.com/watch?v=MnBqd6bB4Jw",
  "https://www.youtube.com/watch?v=5maZNtsWzeY",
  "https://www.youtube.com/watch?v=7ABrpD6asig",
  "https://www.youtube.com/watch?v=7jJLNT9nnyE",
  "https://www.youtube.com/watch?v=1ul64kVtcBQ",
  "https://www.youtube.com/watch?v=n8wrAxXu_wc",
  "https://www.youtube.com/watch?v=yUD7fUjWCM8",
  "https://www.youtube.com/watch?v=catvjIWNrZg",
  "https://www.youtube.com/watch?v=FU3cGC8sk5Y",
  "https://www.youtube.com/watch?v=bnUgt0gl-ds",
  "https://www.youtube.com/watch?v=OteVW3af3BU",
  "https://www.youtube.com/watch?v=GiogArRN6MI",
  "https://www.youtube.com/watch?v=L5PXjssNFqc",
  "https://www.youtube.com/watch?v=T-wjhfE4Q6Q",
  "https://www.youtube.com/watch?v=zmiOmpo27F8",
  "https://www.youtube.com/watch?v=RManbLSTXuc",
  "https://www.youtube.com/watch?v=H8bFFw-0ZQE",
  "https://www.youtube.com/watch?v=S3rx8s-ltwI",
  "https://www.youtube.com/watch?v=e3AB9nAhqjA",
  "https://www.youtube.com/watch?v=r20AvLz4Z4Y",
  "https://www.youtube.com/watch?v=ZmJrO-JOArE",
];

interface VideoInfo {
  title: string;
  channelUrl: string;
  channelTitle: string;
}

async function fetchVideoInfo(videoId: string): Promise<VideoInfo | null> {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const response = await fetch(oembedUrl);

    if (!response.ok) {
      console.warn(`Failed to fetch info for ${videoId}: ${response.status}`);
      return null;
    }

    const data = await response.json();

    // Extract channel URL from author_url
    const channelUrl = data.author_url ? `${data.author_url}/streams` : "";

    return {
      title: data.title || "",
      channelUrl,
      channelTitle: data.author_name || "",
    };
  } catch (error) {
    console.error(`Error fetching ${videoId}:`, error);
    return null;
  }
}

function extractVideoId(url: string): string | null {
  const match = url.match(/[?&]v=([^&]+)/);
  return match ? match[1] : null;
}

async function getNextCameraId(): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("camera_ytb")
    .select("camera_id")
    .order("camera_id", { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    return 132; // Start from 132 if no data
  }

  return parseInt(data[0].camera_id) + 1;
}

async function addNewCameras() {
  console.log(`Processing ${newLinks.length} new camera links...\n`);

  let nextId = await getNextCameraId();
  console.log(`Starting from camera_id: ${nextId}\n`);

  const results = {
    success: 0,
    failed: 0,
    skipped: 0,
  };

  for (const url of newLinks) {
    const videoId = extractVideoId(url);
    if (!videoId) {
      console.log(`❌ Invalid URL: ${url}`);
      results.failed++;
      continue;
    }

    // Check if already exists
    const { data: existing } = await supabaseAdmin
      .from("camera_ytb")
      .select("camera_id")
      .eq("link", url)
      .single();

    if (existing) {
      console.log(`⏭️  Skipped (exists): ${url} (ID: ${existing.camera_id})`);
      results.skipped++;
      continue;
    }

    // Fetch video info
    console.log(`Fetching info for: ${videoId}...`);
    const info = await fetchVideoInfo(videoId);

    if (!info) {
      console.log(`❌ Failed to fetch info: ${url}`);
      results.failed++;
      continue;
    }

    // Insert into database
    const { error } = await supabaseAdmin.from("camera_ytb").insert({
      camera_id: nextId,
      link: url,
      ytb_title: info.title,
      host_link: info.channelUrl,
      placename: info.title, // Use title as placeholder
      link_available: true,
      last_check: new Date().toISOString(),
      sunrise_advance: 0,
      sunset_delay: 0,
    });

    if (error) {
      console.log(`❌ Database error for ${videoId}:`, error.message);
      results.failed++;
      continue;
    }

    console.log(`✅ Added Camera ${nextId}: ${info.title.substring(0, 60)}...`);
    console.log(`   Channel: ${info.channelTitle}`);
    console.log(`   Host: ${info.channelUrl}\n`);

    results.success++;
    nextId++;

    // Rate limit: wait 500ms between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log("\n" + "=".repeat(70));
  console.log("Summary:");
  console.log(`- Successfully added: ${results.success}`);
  console.log(`- Skipped (existing): ${results.skipped}`);
  console.log(`- Failed: ${results.failed}`);
  console.log(`- Total processed: ${newLinks.length}`);
}

addNewCameras().catch(console.error);
