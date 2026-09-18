import { afterEach, describe, expect, it, vi } from "vitest";
import { distanceKm, locateCandidate, sameCountry } from "@/lib/geocode";

afterEach(() => vi.unstubAllGlobals());

describe("sameCountry", () => {
  it("matches aliases and ignores case", () => {
    expect(sameCountry("USA", "United States")).toBe(true);
    expect(sameCountry("uk", "United Kingdom")).toBe(true);
    expect(sameCountry("Italy", "italy")).toBe(true);
    expect(sameCountry("Italy", "Spain")).toBe(false);
    expect(sameCountry(null, "Spain")).toBe(false);
  });
});

describe("distanceKm", () => {
  it("is roughly right", () => {
    // Times Square → Statue of Liberty ≈ 8.5 km
    expect(distanceKm(40.758, -73.9855, 40.6892, -74.0445)).toBeCloseTo(9, 0);
    expect(distanceKm(1, 1, 1, 1)).toBe(0);
  });
});

describe("locateCandidate", () => {
  const results = (rows: Array<Record<string, unknown>>) =>
    new Response(JSON.stringify({ results: rows }), { status: 200 });

  it("tries the place name first and keeps only hits in the expected country", async () => {
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(async (url) =>
      url.includes("Springfield")
        ? results([
            { name: "Springfield", latitude: 39.8, longitude: -89.6, country: "United States", country_code: "US", admin1: "Illinois", timezone: "America/Chicago", population: 110000 },
            { name: "Springfield", latitude: 42.1, longitude: -72.6, country: "United States", country_code: "US", admin1: "Massachusetts", timezone: "America/New_York", population: 150000 },
            { name: "Springfield", latitude: -37.5, longitude: 146.0, country: "Australia", country_code: "AU", admin1: "Victoria", timezone: "Australia/Melbourne", population: 3000 },
          ])
        : results([])
    );
    vi.stubGlobal("fetch", fetchMock);

    const found = await locateCandidate({ placename: "Springfield", city: "Springfield", region: "Illinois", country: "USA" });
    expect(found?.via).toBe("placename");
    expect(found?.hit.admin1).toBe("Illinois");
    expect(found?.hit.timezone).toBe("America/Chicago");
  });

  it("falls back to the city and picks the best-known hit without a region", async () => {
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(async (url) =>
      url.includes("Nubble")
        ? results([])
        : results([
            { name: "York", latitude: 53.96, longitude: -1.08, country: "United Kingdom", country_code: "GB", timezone: "Europe/London", population: 150000 },
            { name: "York", latitude: 43.16, longitude: -70.65, country: "United States", country_code: "US", admin1: "Maine", timezone: "America/New_York", population: 12000 },
          ])
    );
    vi.stubGlobal("fetch", fetchMock);

    const found = await locateCandidate({ placename: "Nubble Lighthouse", city: "York", region: null, country: "USA" });
    expect(found?.via).toBe("city");
    expect(found?.hit.country).toBe("United States");
  });

  it("returns null when nothing is in the right country", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => results([{ name: "Paris", latitude: 33.66, longitude: -95.55, country: "United States", country_code: "US", timezone: "America/Chicago", population: 25000 }])));
    expect(await locateCandidate({ placename: "Paris", city: null, region: null, country: "France" })).toBeNull();
  });
});
