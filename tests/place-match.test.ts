import { describe, expect, it } from "vitest";
import { calculatePlaceMatch } from "@/lib/youtube";

// Pairs taken from real channel /streams pages and search results on
// 2026-09-17. The threshold in lib/cameraRefresh.ts is 0.5 (channel) and 0.7
// (search); these pin the behaviour that separated correct repairs from the
// wrong-location matches the old title-based matcher produced.
describe("calculatePlaceMatch", () => {
  const accept: Array<[string, string | null, string]> = [
    ["Sebec Lake", "Dover-Foxcroft", "Sebec Lake, Maine - Live - Granny's Wine Cellar at Merrill's Marina"],
    ["Park Square", "Westfield", "Westfield, Massachusetts US - Park Square Live"],
    ["Green Line", "Boston", "Boston Weather Cam, MA Live Cam - Green Line"],
    ["Boston Harbor", "Boston", "Boston Harbor, Massachusetts - Live - Hyatt Regency Boston Harbor"],
    ["Times Square", "New York City", "EarthCam Live:  Times Square North 4K"],
    ["Seaside Heights Boardwalk", "Seaside Heights", "EarthCam Live:  Seaside Heights, NJ - North View"],
    ["St. Mark's Basin", "Venice", "🔴 Venice Live Cam - San Marco Basin in Live Streaming"],
    ["Sottomarina Beach", "Chioggia", "🔴 Bagni Miki - Chioggia Sottomarina (Venezia) - Live Full HD"],
    ["Big Buddha Temple", "Koh Samui", "🔴 Live Camera Stream | Floating Lotus | Big Buddha | Koh Samui"],
    ["The White House", "Washington, D.C.", "earthTV® White House Cam is back!"],
    ["Nubble Lighthouse", "York", "Nubble Lighthouse, York, Maine USA - LIVE"],
  ];
  it.each(accept)("accepts %s / %s ← %s", (name, city, title) => {
    expect(calculatePlaceMatch(name, city, title)).toBeGreaterThanOrEqual(0.5);
  });

  const reject: Array<[string, string | null, string]> = [
    // Different town, only generic words in common ("port", "saint").
    ["Port of Saint-Malo", "Saint-Malo", "Webcam Saint-Quay-Portrieux - Le Port"],
    // Same city, but the place name itself barely matches.
    ["Skydeck Chicago (Willis Tower)", "Chicago", "EarthCam Live:  Midway Airport (Chicago, IL)"],
    ["Sebec Lake", "Dover-Foxcroft", "Moosehead Lake, Maine - LIVE cam"],
    ["Bar Harbor - North View", "Bar Harbor", "Boston Harbor, Massachusetts - Live - Hyatt Regency"],
    ["Nubble Lighthouse", "York", "Moosehead Lake, Maine - LIVE cam"],
    ["Statue of Liberty", "New York City", "EarthCam Live:  Sitka, Alaska"],
    // Multi-camera tours are never a fixed view.
    ["Mauna Kea Observatory", "Mauna Kea", "🔴 LIVE: Big Island Hawaiʻi Webcam Tour 🌋 Kīlauea Volcano, Kohala Coast, Mauna Kea"],
  ];
  it.each(reject)("rejects %s / %s ← %s", (name, city, title) => {
    expect(calculatePlaceMatch(name, city, title)).toBeLessThan(0.5);
  });

  it("does not let the city alone clear the bar", () => {
    expect(calculatePlaceMatch("Anything Else", "Boston", "Boston Weather Cam")).toBeLessThan(0.5);
  });

  it("handles a missing city and non-Latin titles without throwing", () => {
    expect(calculatePlaceMatch("Han River View", null, "서울 한강 라이브")).toBe(0);
    expect(calculatePlaceMatch("Han River View", "Seoul", "🔴 Seoul 4K LIVE | Han River | 서울 한강")).toBeGreaterThanOrEqual(0.7);
  });
});

describe("looksLikeBroadcast", () => {
  it("rejects news and event coverage that merely names a landmark", async () => {
    const { looksLikeBroadcast } = await import("@/lib/youtube");
    expect(looksLikeBroadcast("LIVE: President Suddenly Leaves White House Briefing | US News LIVE", "https://www.youtube.com/@TimesNow")).toBe(true);
    expect(looksLikeBroadcast("Times Square live cam", "https://www.youtube.com/@earthcam")).toBe(false);
    expect(looksLikeBroadcast("earthTV® White House Cam is back!", "https://www.youtube.com/@earthTV")).toBe(false);
    expect(looksLikeBroadcast("Anything at all", "https://www.youtube.com/@WION")).toBe(true);
  });
});
