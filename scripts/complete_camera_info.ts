import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Camera information based on titles
const cameraInfo: Record<number, {
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  timezone: string;
  tags: string[];
  placename?: string;
}> = {
  132: {
    city: "Tokyo",
    country: "Japan",
    latitude: 35.6585,
    longitude: 139.7454,
    timezone: "Asia/Tokyo",
    tags: ["City Skyline", "Urban"],
    placename: "Kachidoki & Tsukiji"
  },
  133: {
    city: "Tokyo",
    country: "Japan",
    latitude: 35.6250,
    longitude: 139.7755,
    timezone: "Asia/Tokyo",
    tags: ["City Skyline", "Harbor", "Urban"],
    placename: "Odaiba"
  },
  134: {
    city: "Tokyo",
    country: "Japan",
    latitude: 35.6295,
    longitude: 139.7787,
    timezone: "Asia/Tokyo",
    tags: ["Harbor", "Urban"],
    placename: "Tokyo Bay"
  },
  135: {
    city: "Niseko",
    country: "Japan",
    latitude: 42.8048,
    longitude: 140.6875,
    timezone: "Asia/Tokyo",
    tags: ["Ski Resort", "Mountain Range"],
    placename: "Niseko Hanazono Resort"
  },
  136: {
    city: "Koh Samui",
    country: "Thailand",
    latitude: 9.5357,
    longitude: 100.0589,
    timezone: "Asia/Bangkok",
    tags: ["Beach", "Cultural Landmark"],
    placename: "Big Buddha Temple"
  },
  137: {
    city: "Yamagata",
    country: "Japan",
    latitude: 38.1496,
    longitude: 140.4092,
    timezone: "Asia/Tokyo",
    tags: ["Ski Resort", "Mountain Range"],
    placename: "Zao Onsen Ski Resort"
  },
  138: {
    city: "Katashina",
    country: "Japan",
    latitude: 36.7833,
    longitude: 139.4167,
    timezone: "Asia/Tokyo",
    tags: ["Ski Resort", "Mountain Range"],
    placename: "Marunuma Kogen"
  },
  139: {
    city: "Millinocket",
    country: "USA",
    latitude: 45.6514,
    longitude: -68.7097,
    timezone: "America/New_York",
    tags: ["Mountain Range", "Natural Scenery"],
    placename: "Mt Katahdin"
  },
  140: {
    city: "Portsmouth",
    country: "USA",
    latitude: 43.0718,
    longitude: -70.7626,
    timezone: "America/New_York",
    tags: ["Winter Sports", "Urban"],
    placename: "Outdoor Skating Rink"
  },
  141: {
    city: "Portsmouth",
    country: "USA",
    latitude: 43.0718,
    longitude: -70.7626,
    timezone: "America/New_York",
    tags: ["Winter Sports", "Urban"],
    placename: "Outdoor Skating Rink - Patio 1"
  },
  142: {
    city: "Portsmouth",
    country: "USA",
    latitude: 43.0718,
    longitude: -70.7626,
    timezone: "America/New_York",
    tags: ["Winter Sports", "Urban"],
    placename: "Outdoor Skating Rink - Patio 2"
  },
  143: {
    city: "Effingham",
    country: "USA",
    latitude: 43.7317,
    longitude: -71.0620,
    timezone: "America/New_York",
    tags: ["Natural Scenery", "Rural"],
    placename: "Effingham"
  },
  144: {
    city: "Dover-Foxcroft",
    country: "USA",
    latitude: 45.1836,
    longitude: -69.0664,
    timezone: "America/New_York",
    tags: ["Lake", "Natural Scenery"],
    placename: "Sebec Lake"
  },
  145: {
    city: "Greenwood",
    country: "USA",
    latitude: 44.3897,
    longitude: -70.6636,
    timezone: "America/New_York",
    tags: ["Mountain Range", "Ski Resort"],
    placename: "Big Moose Mountain"
  },
  146: {
    city: "North Conway",
    country: "USA",
    latitude: 44.0540,
    longitude: -71.1286,
    timezone: "America/New_York",
    tags: ["Railway", "Urban"],
    placename: "Conway Scenic Railroad"
  },
  147: {
    city: "Tamworth",
    country: "USA",
    latitude: 43.8729,
    longitude: -71.2673,
    timezone: "America/New_York",
    tags: ["Lake", "Natural Scenery"],
    placename: "Chocorua Lake"
  },
  148: {
    city: "Westfield",
    country: "USA",
    latitude: 42.1251,
    longitude: -72.7495,
    timezone: "America/New_York",
    tags: ["Urban", "Street Scene"],
    placename: "Park Square"
  },
  149: {
    city: "Gloucester",
    country: "USA",
    latitude: 42.6159,
    longitude: -70.6828,
    timezone: "America/New_York",
    tags: ["Harbor", "Beach"],
    placename: "Annisquam Yacht Club"
  },
  150: {
    city: "Chester",
    country: "USA",
    latitude: 42.2792,
    longitude: -72.9881,
    timezone: "America/New_York",
    tags: ["Railway", "Urban"],
    placename: "Chester Railway Station"
  },
  151: {
    city: "Kennebunk",
    country: "USA",
    latitude: 43.3615,
    longitude: -70.4767,
    timezone: "America/New_York",
    tags: ["Beach", "Coastal"],
    placename: "Seaside Inn, Kennebunk Beach"
  },
  152: {
    city: "Boston",
    country: "USA",
    latitude: 42.3601,
    longitude: -71.0589,
    timezone: "America/New_York",
    tags: ["Harbor", "City Skyline", "Urban"],
    placename: "Boston Harbor"
  },
  153: {
    city: "Portsmouth",
    country: "USA",
    latitude: 43.0718,
    longitude: -70.7626,
    timezone: "America/New_York",
    tags: ["Harbor", "Maritime"],
    placename: "Piscataqua River"
  },
  154: {
    city: "Monson",
    country: "USA",
    latitude: 45.2856,
    longitude: -69.5053,
    timezone: "America/New_York",
    tags: ["Rural", "Natural Scenery"],
    placename: "Monson"
  },
  155: {
    city: "McAdam",
    country: "Canada",
    latitude: 45.5958,
    longitude: -67.3281,
    timezone: "America/Moncton",
    tags: ["Railway", "Historic"],
    placename: "McAdam Railway Station"
  },
  156: {
    city: "Greenville",
    country: "USA",
    latitude: 45.4592,
    longitude: -69.5900,
    timezone: "America/New_York",
    tags: ["Lake", "Natural Scenery"],
    placename: "Blair Hill Inn, Moosehead Lake"
  },
  157: {
    city: "York",
    country: "USA",
    latitude: 43.1651,
    longitude: -70.5928,
    timezone: "America/New_York",
    tags: ["Lighthouse", "Coastal", "Landmark"],
    placename: "Nubble Lighthouse"
  },
  158: {
    city: "York",
    country: "USA",
    latitude: 43.1473,
    longitude: -70.6431,
    timezone: "America/New_York",
    tags: ["Beach", "Coastal"],
    placename: "York Harbor Beach"
  },
  159: {
    city: "Bar Harbor",
    country: "USA",
    latitude: 44.3876,
    longitude: -68.2039,
    timezone: "America/New_York",
    tags: ["Harbor", "Coastal"],
    placename: "Bar Harbor - North View"
  },
  160: {
    city: "York",
    country: "USA",
    latitude: 43.1737,
    longitude: -70.6103,
    timezone: "America/New_York",
    tags: ["Beach", "Coastal"],
    placename: "York Beach"
  },
  161: {
    city: "Bar Harbor",
    country: "USA",
    latitude: 44.3876,
    longitude: -68.2039,
    timezone: "America/New_York",
    tags: ["Harbor", "Coastal"],
    placename: "Bar Harbor - West View"
  },
  162: {
    city: "Shrewsbury",
    country: "USA",
    latitude: 42.2959,
    longitude: -71.7129,
    timezone: "America/New_York",
    tags: ["Natural Scenery", "Lake"],
    placename: "Shrewsbury Pond"
  },
  163: {
    city: "Portland",
    country: "USA",
    latitude: 43.6591,
    longitude: -70.2568,
    timezone: "America/New_York",
    tags: ["Winter Sports", "Urban"],
    placename: "Thompson's Point Rink"
  },
  164: {
    city: "Southwest Harbor",
    country: "USA",
    latitude: 44.2720,
    longitude: -68.3267,
    timezone: "America/New_York",
    tags: ["Harbor", "National Park"],
    placename: "Southwest Harbor, Acadia National Park"
  },
  165: {
    city: "Boston",
    country: "USA",
    latitude: 42.3601,
    longitude: -71.0589,
    timezone: "America/New_York",
    tags: ["Urban", "Railway"],
    placename: "Green Line"
  },
  166: {
    city: "Boston",
    country: "USA",
    latitude: 42.3601,
    longitude: -71.0589,
    timezone: "America/New_York",
    tags: ["River", "Urban"],
    placename: "Charles River"
  },
  167: {
    city: "North Conway",
    country: "USA",
    latitude: 44.0540,
    longitude: -71.1286,
    timezone: "America/New_York",
    tags: ["Urban", "Natural Scenery"],
    placename: "North Conway"
  },
  168: {
    city: "Greenville",
    country: "USA",
    latitude: 45.4592,
    longitude: -69.5900,
    timezone: "America/New_York",
    tags: ["Lake", "Natural Scenery"],
    placename: "Moosehead Lake"
  },
  169: {
    city: "Westfield",
    country: "USA",
    latitude: 42.1251,
    longitude: -72.7495,
    timezone: "America/New_York",
    tags: ["Railway", "Urban"],
    placename: "Westfield Railfan"
  },
  170: {
    city: "Portsmouth",
    country: "USA",
    latitude: 43.0718,
    longitude: -70.7626,
    timezone: "America/New_York",
    tags: ["Harbor", "Maritime"],
    placename: "Brewster's Bait & Tackle"
  },
  171: {
    city: "Cape Porpoise",
    country: "USA",
    latitude: 43.3689,
    longitude: -70.4417,
    timezone: "America/New_York",
    tags: ["Harbor", "Coastal"],
    placename: "Cape Porpoise Inner Harbor"
  },
  172: {
    city: "Multiple",
    country: "Japan",
    latitude: 35.6762,
    longitude: 139.6503,
    timezone: "Asia/Tokyo",
    tags: ["Urban", "Multiple Locations"],
    placename: "Multiple locations in Japan"
  },
};

async function updateCameraInfo() {
  console.log("Updating camera geographic information...\n");

  let updated = 0;
  let failed = 0;

  for (const [cameraId, info] of Object.entries(cameraInfo)) {
    try {
      const { error } = await supabaseAdmin
        .from("camera_ytb")
        .update({
          city: info.city,
          country: info.country,
          latitude: info.latitude,
          longitude: info.longitude,
          timezone: info.timezone,
          tag: info.tags.join(","),
          ...(info.placename && { placename: info.placename }),
        })
        .eq("camera_id", cameraId);

      if (error) {
        console.log(`❌ Failed to update Camera ${cameraId}:`, error.message);
        failed++;
      } else {
        console.log(`✅ Updated Camera ${cameraId}: ${info.placename || info.city}`);
        updated++;
      }
    } catch (error) {
      console.error(`❌ Error updating Camera ${cameraId}:`, error);
      failed++;
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log("Summary:");
  console.log(`- Successfully updated: ${updated}`);
  console.log(`- Failed: ${failed}`);
  console.log(`- Total processed: ${Object.keys(cameraInfo).length}`);
}

updateCameraInfo().catch(console.error);
