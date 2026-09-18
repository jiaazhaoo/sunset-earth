import { describe, expect, it } from "vitest";
import { analyzeTitleByRules, classifyType, titleSegments } from "@/lib/place-rules";
import type { GeocodeHit } from "@/lib/geocode";

// A tiny fake of Open-Meteo's geocoder, shaped like real responses observed
// on 2026-09-18 (it is fuzzy: "Etna" returns "Emerson" first).
const hit = (p: Partial<GeocodeHit> & Pick<GeocodeHit, "name" | "country" | "countryCode">): GeocodeHit => ({
  latitude: 0, longitude: 0, admin1: null, admin2: null, admin3: null, featureCode: "PPL",
  timezone: "UTC", population: 0, ...p,
});
const WORLD: Record<string, GeocodeHit[]> = {
  york: [
    hit({ name: "York", country: "United Kingdom", countryCode: "GB", admin1: "England", population: 153717, timezone: "Europe/London", latitude: 53.96, longitude: -1.08 }),
    hit({ name: "York", country: "United States", countryCode: "US", admin1: "Maine", population: 12529, timezone: "America/New_York", latitude: 43.16, longitude: -70.65 }),
  ],
  "sebec lake": [hit({ name: "Sebec Lake", country: "United States", countryCode: "US", admin1: "Maine", admin3: "Town of Willimantic", timezone: "America/New_York" })],
  "lauderdale by the sea": [hit({ name: "Lauderdale by the sea", country: "United States", countryCode: "US", admin1: "Florida", population: 6460, timezone: "America/New_York" })],
  etna: [hit({ name: "Emerson", country: "United States", countryCode: "US", admin1: "New Jersey" }), hit({ name: "Etna", country: "United States", countryCode: "US", admin1: "Ohio", population: 1215 })],
  sicily: [hit({ name: "Sicily", country: "Italy", countryCode: "IT", admin1: "Sicily", featureCode: "ADM1" })],
  hakone: [hit({ name: "Hakone", country: "Japan", countryCode: "JP", admin1: "Kanagawa", population: 11293, timezone: "Asia/Tokyo" })],
  paris: [
    hit({ name: "Paris", country: "France", countryCode: "FR", admin1: "Île-de-France", population: 2138551 }),
    hit({ name: "Paris", country: "United States", countryCode: "US", admin1: "Texas", population: 24000 }),
  ],
  "times square": [hit({ name: "Times Square", country: "United States", countryCode: "US", admin1: "New York", featureCode: "PPLX", population: 17749 })],
  "boston": [hit({ name: "Boston", country: "United States", countryCode: "US", admin1: "Massachusetts", population: 650000 })],
};
const fakeGeocode = async (name: string) => WORLD[name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()] ?? [];
const run = (title: string, priorCountry?: string) => analyzeTitleByRules(title, { geocodeFn: fakeGeocode, priorCountry });

describe("titleSegments", () => {
  it("strips noise and splits on punctuation and place prepositions", () => {
    expect(titleSegments("EarthCam Live:  Anglins Pier (Lauderdale-By-The-Sea, FL)")).toEqual(["Anglins Pier", "Lauderdale-By-The-Sea", "FL"]);
    expect(titleSegments("🔴 Live Now: 24/7 Napili Bay Beach in West Maui, Hawaii in 4K Ultra HD")).toEqual(["Napili Bay Beach", "West Maui", "Hawaii"]);
    expect(titleSegments("Nubble Lighthouse, York, Maine USA - LIVE")).toEqual(["Nubble Lighthouse", "York", "Maine USA"]);
  });
});

describe("analyzeTitleByRules", () => {
  it("resolves a town corroborated by its state and names the landmark", async () => {
    const a = await run("Sebec Lake, Maine - Live - Granny's Wine Cellar at Merrill's Marina", "USA");
    expect(a.hit?.name).toBe("Sebec Lake");
    expect(a.placename).toBe("Sebec Lake");
    expect(a.country).toBe("United States");
    expect(a.region).toBe("Maine");
    expect(a.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("uses a state abbreviation to corroborate and keeps the pier as the place", async () => {
    const a = await run("EarthCam Live:  Anglins Pier (Lauderdale-By-The-Sea, FL)", "USA");
    expect(a.hit?.name).toBe("Lauderdale by the sea");
    expect(a.placename).toBe("Anglins Pier");
    expect(a.city).toBe("Lauderdale by the sea");
    expect(a.primaryType).toBe("harbor");
    expect(a.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("picks York, Maine over York, England when the title says Maine", async () => {
    const a = await run("Nubble Lighthouse, York, Maine USA - LIVE");
    expect(a.hit?.admin1).toBe("Maine");
    expect(a.placename).toBe("Nubble Lighthouse");
    expect(a.primaryType).toBe("cultural-landmark");
    expect(a.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it("marks a bare ambiguous town as low confidence", async () => {
    const a = await run("York live cam");
    expect(a.confidence).toBeLessThan(0.5);
    expect(a.evidence.join(" ")).toMatch(/ambiguous/);
  });

  it("lets the channel's usual country break a tie", async () => {
    const a = await run("Paris downtown live", "USA");
    expect(a.hit?.admin1).toBe("Texas");
    expect(a.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("refuses fuzzy geocoder hits (Etna is not Emerson) and finds the corroborated one", async () => {
    const a = await run("🔴 Live Now: 24/7 Etna Volcano, Sicily Italy in 4K");
    // "Etna" only exact-matches the Ohio hit, which Sicily/Italy do not
    // corroborate; "Sicily" itself resolves in Italy and is corroborated by "Italy".
    expect(a.hit?.country).toBe("Italy");
    expect(a.primaryType).toBe("volcano");
    expect(a.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it("handles non-Latin titles with an English town in them", async () => {
    const a = await run("「箱根遊船 SORAKAZE」ライブカメラ  / Live camera ”SORAKAZE”(Hakone Cruise)");
    expect(a.hit?.name).toBe("Hakone");
    expect(a.country).toBe("Japan");
  });

  it("rejects immersive VR180/360 streams and strips leading adjectives", async () => {
    const vr = await run("🔴 LIVE 4K VR180° Stand Before an Erupting Volcano - Semeru Volcano, Java");
    expect(vr.isFixedOutdoorView).toBe(false);
    expect(titleSegments("🔴 Live Now: 24/7 Erupting Semeru Volcano in Java, Indonesia in 4K")[0]).toBe("Semeru Volcano");
  });

  it("flags compilations and gives up gracefully without any hit", async () => {
    const a = await run("🔴 1200 TOP LIVE WEBCAMS around the World with relaxing music");
    expect(a.isFixedOutdoorView).toBe(false);
    expect(a.hit).toBeNull();
    expect(a.confidence).toBeLessThan(0.5);
  });
});

describe("classifyType", () => {
  it("maps keywords, then feature codes, then defaults", () => {
    expect(classifyType("Green Line Boston", null)).toBe("nature");
    expect(classifyType("Rainbow Bridge & Tokyo Bay", null)).toBe("beach");
    expect(classifyType("Somewhere", "VLC")).toBe("volcano");
    expect(classifyType("Downtown Calgary skyline", "PPL")).toBe("city-skyline");
  });
});
