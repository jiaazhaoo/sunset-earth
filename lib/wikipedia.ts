import { calculatePlaceMatch } from "@/lib/youtube";
import { distanceKm, geocode, sameCountry, type GeocodeHit } from "@/lib/geocode";

/**
 * A short introduction to the place a camera looks at, from Wikipedia.
 *
 * Three attempts, each one API call (a generator plus coordinates, intro
 * extract and disambiguation flag in the same request):
 *   1. search for the place by name, accepted if the article is geotagged
 *      within a few km of the camera ("Skydeck Chicago" → Willis Tower);
 *   2. articles geotagged right at the camera whose title names the place;
 *   3. the town, disambiguated by region ("Leavenworth, Washington").
 * Results are cached per camera in camera_ytb, so this runs once a camera.
 */

export type PlaceSummary = {
  title: string;
  extract: string;
  url: string;
};

const UA = "sunset-earth.com (camera place descriptions; contact via site)";
const MAX_CHARS = 280;

type Page = {
  title: string;
  extract?: string;
  coordinates?: Array<{ lat: number; lon: number }>;
  pageprops?: { disambiguation?: string };
};

async function queryPages(params: Record<string, string>): Promise<Page[]> {
  const search = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    prop: "coordinates|extracts|pageprops",
    exintro: "1",
    explaintext: "1",
    exsentences: "3",
    exlimit: "max",
    ppprop: "disambiguation",
    ...params,
  });
  const res = await fetch(`https://en.wikipedia.org/w/api.php?${search}`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    cache: "no-store",
  });
  // Rate limits and outages must not be cached as "no article": throw so the
  // caller leaves the camera undescribed and tries again next time.
  if (!res.ok) throw new WikipediaUnavailable(res.status);
  const data = (await res.json()) as { query?: { pages?: Page[] } };
  return data.query?.pages ?? [];
}

export class WikipediaUnavailable extends Error {
  constructor(public status: number) {
    super(`Wikipedia responded ${status}`);
  }
}

function toSummary(page: Page): PlaceSummary | null {
  if (page.pageprops?.disambiguation !== undefined || !page.extract) return null;
  const extract = twoSentences(page.extract);
  if (extract.length < 60) return null;
  return {
    title: page.title,
    extract,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`,
  };
}

function kmFrom(page: Page, here: { lat: number; lng: number } | null): number | null {
  const c = page.coordinates?.[0];
  if (!c || !here) return null;
  return distanceKm(here.lat, here.lng, c.lat, c.lon);
}

export async function describePlace(input: {
  placename: string;
  city: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
}): Promise<PlaceSummary | null> {
  const here = input.lat !== null && input.lng !== null ? { lat: input.lat, lng: input.lng } : null;

  // Articles about institutions that merely share the town's name are the
  // usual false friends ("University of Calgary" for "Calgary Downtown").
  const institution = /\b(university|college|school|church|cathedral|hospital|observatory|museum|library|station|airport|hotel|stadium|arena|county|borough|township|district|company|corporation)\b/i;
  const namedSuch = (title: string) => {
    const w = title.match(institution)?.[0];
    return !w || new RegExp(`\\b${w}\\b`, "i").test(input.placename);
  };

  // 1. The landmark by name: best-scoring search hit that is either a strong
  //    name match nearby, or sits right where the camera is.
  const byName = await queryPages({
    generator: "search",
    gsrsearch: [input.placename, input.city].filter(Boolean).join(" "),
    gsrlimit: "5",
  });
  const candidates = byName
    .map((p) => ({ p, score: calculatePlaceMatch(input.placename, input.city, p.title), km: kmFrom(p, here) }))
    .filter(({ p, score, km }) => {
      if (!namedSuch(p.title)) return false;
      if (km === null) return !here && score >= 0.6;
      return (score >= 0.6 && km <= 8) || (score >= 0.35 && km <= 1.2) || km <= 0.25;
    })
    .sort((a, b) => b.score - a.score || (a.km ?? 99) - (b.km ?? 99));
  for (const { p } of candidates) {
    const s = toSummary(p);
    if (s) return s;
  }

  // 2. Articles geotagged at the camera whose title names the place.
  if (here) {
    const near = await queryPages({
      generator: "geosearch",
      ggscoord: `${here.lat}|${here.lng}`,
      ggsradius: "1500",
      ggslimit: "10",
    });
    const scored = near
      .filter((p) => namedSuch(p.title))
      .map((p) => ({ p, score: calculatePlaceMatch(input.placename, null, p.title), km: kmFrom(p, here) ?? 99 }))
      .filter((x) => x.score >= 0.49) // ≥ 70 % of the place name
      .sort((a, b) => b.score - a.score || a.km - b.km);
    for (const { p } of scored.slice(0, 2)) {
      const s = toSummary(p);
      if (s) return s;
    }
  }

  // 3. The town. Geocode it for its region so "Leavenworth" becomes
  //    "Leavenworth, Washington" rather than the Kansas one.
  if (input.city) {
    let hits: GeocodeHit[] = [];
    try {
      hits = await geocode(input.city);
    } catch {
      hits = [];
    }
    const hit = (here
      ? hits.filter((h) => distanceKm(here.lat, here.lng, h.latitude, h.longitude) <= 80)
      : hits.filter((h) => sameCountry(h.country, input.country)))[0];
    const town = hit ? `${hit.name}, ${hit.admin1 ?? hit.country}` : input.city;
    const pages = await queryPages({ generator: "search", gsrsearch: town, gsrlimit: "4" });
    for (const page of pages) {
      const km = kmFrom(page, here);
      if (km !== null && km > 80) continue;
      const s = toSummary(page);
      if (s && isPlaceLike(s.extract)) return s;
    }
  }
  return null;
}

/** Wikipedia's first sentences say "X is a city/town/village/…" for places. */
function isPlaceLike(extract: string): boolean {
  return /\b(is|was) (a|an|the) ([\w-]+ ){0,4}(city|town|village|municipality|borough|island|region|district|capital|resort|commune|suburb|neighbou?rhood|community|hamlet|county|province|state|parish|lake|mountain|volcano|beach|harbou?r|bay|park|station|bridge|tower|lighthouse|square|castle|temple|cathedral|palace)\b/i.test(
    extract
  );
}

export function twoSentences(text: string): string {
  let clean = text.replace(/\s+/g, " ");
  // Drop pronunciation/native-name brackets, innermost first so nesting works.
  for (let i = 0; i < 4; i++) clean = clean.replace(/\s*\[[^\[\]]*\]/g, "");
  for (let i = 0; i < 4; i++) clean = clean.replace(/\s*\(([^()]*)\)/g, (m, inner: string) => (inner.length > 30 || /[^\x00-\x7F]/.test(inner) ? "" : m));
  clean = clean.replace(/\s+([,.;:])/g, "$1").replace(/\s+/g, " ").trim();
  // Split only at sentence punctuation followed by a capitalised word, so
  // "1,451-foot (442.3 m)" and "St. Mark's" stay whole.
  const sentences = clean.split(/(?<=[.!?])\s+(?=[A-Z"“])/);
  let out = "";
  for (const s of sentences) {
    if (out && out.length + s.length > MAX_CHARS) break;
    out += s.trim() + " ";
    if (out.split(/[.!?]\s/).length > 2) break;
  }
  out = out.trim();
  if (out.length > MAX_CHARS) out = out.slice(0, MAX_CHARS - 1).replace(/\s+\S*$/, "") + "…";
  return out;
}
