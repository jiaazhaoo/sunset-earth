/**
 * Open-Meteo's geocoding API: free, keyless, and it returns the IANA
 * timezone alongside coordinates, which is exactly what a camera row needs.
 * https://open-meteo.com/en/docs/geocoding-api
 */

export type GeocodeHit = {
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  countryCode: string;
  admin1: string | null;
  admin2: string | null;
  admin3: string | null;
  /** GeoNames feature code: PPL (place), MT, LK, BCH, HBR, VLC, AIRP, RSTN… */
  featureCode: string | null;
  timezone: string;
  population: number;
};

type ApiResult = {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  country_code?: string;
  admin1?: string;
  admin2?: string;
  admin3?: string;
  timezone?: string;
  population?: number;
  feature_code?: string;
};

export async function geocode(name: string, count = 8): Promise<GeocodeHit[]> {
  const url =
    "https://geocoding-api.open-meteo.com/v1/search?name=" +
    encodeURIComponent(name) +
    `&count=${count}&language=en&format=json`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return [];
  const data = (await response.json()) as { results?: ApiResult[] };
  return (data.results ?? [])
    .filter((r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude))
    .map((r) => ({
      name: r.name,
      latitude: r.latitude,
      longitude: r.longitude,
      country: r.country ?? "",
      countryCode: (r.country_code ?? "").toUpperCase(),
      admin1: r.admin1 ?? null,
      admin2: r.admin2 ?? null,
      admin3: r.admin3 ?? null,
      featureCode: r.feature_code ?? null,
      timezone: r.timezone ?? "UTC",
      population: r.population ?? 0,
    }));
}

const COUNTRY_ALIASES: Record<string, string[]> = {
  usa: ["united states", "us", "u.s.", "u.s.a.", "america"],
  uk: ["united kingdom", "great britain", "england", "scotland", "wales"],
  netherlands: ["the netherlands", "holland"],
  czechia: ["czech republic"],
  "south korea": ["korea", "republic of korea"],
};

export function sameCountry(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const norm = (s: string) => s.trim().toLowerCase();
  const na = norm(a);
  const nb = norm(b);
  if (na === nb) return true;
  for (const [canon, aliases] of Object.entries(COUNTRY_ALIASES)) {
    const group = new Set([canon, ...aliases]);
    if (group.has(na) && group.has(nb)) return true;
  }
  return false;
}

/**
 * Resolve a candidate's place to coordinates. Tries the most specific query
 * first (place name), then the city, and only accepts hits in the expected
 * country so "Springfield" cannot land on the wrong continent.
 */
export async function locateCandidate(input: {
  placename: string;
  city: string | null;
  region: string | null;
  country: string;
}): Promise<{ hit: GeocodeHit; via: "placename" | "city" } | null> {
  const queries: Array<{ q: string; via: "placename" | "city" }> = [];
  if (input.placename) queries.push({ q: input.placename, via: "placename" });
  if (input.city) queries.push({ q: input.city, via: "city" });

  for (const { q, via } of queries) {
    let hits: GeocodeHit[];
    try {
      hits = await geocode(q);
    } catch {
      continue;
    }
    const inCountry = hits.filter((h) => sameCountry(h.country, input.country));
    if (!inCountry.length) continue;
    // Prefer a hit whose region matches, then the most populous (best known).
    const regionMatch = input.region
      ? inCountry.find((h) => h.admin1 && sameText(h.admin1, input.region))
      : undefined;
    const hit = regionMatch ?? inCountry.sort((a, b) => b.population - a.population)[0];
    return { hit, via };
  }
  return null;
}

function sameText(a: string, b: string | null): boolean {
  return !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Great-circle distance in kilometres. */
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
