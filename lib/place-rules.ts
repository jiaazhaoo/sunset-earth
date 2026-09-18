import { geocode, sameCountry, type GeocodeHit } from "@/lib/geocode";
import type { StreamAnalysis } from "@/lib/llm";
import { TAGS } from "@/lib/llm";
import type { CameraPrimaryType } from "@/lib/camera-metadata-types";

/**
 * Model-free title analysis. The idea: a stream title is a list of place
 * words separated by punctuation, and the geocoder is a good lie detector.
 *
 *   "Nubble Lighthouse, York, Maine USA - LIVE"
 *     → segments  ["Nubble Lighthouse", "York", "Maine", "USA"]
 *     → "York" geocodes exactly (York, Maine and York, UK); "Maine" equals
 *       the first hit's state and "USA" its country, so the Maine one wins
 *     → placename "Nubble Lighthouse" (the segment that is not a town),
 *       city York, country United States, confidence high
 *
 * Confidence is earned only by agreement: an exact town match, a second
 * segment naming its state or country, and the host channel's usual country.
 * A lone fuzzy hit never clears the auto-approve bar.
 */

export type RuleAnalysis = StreamAnalysis & {
  /** Anchor geocode hit, when a town in the title resolved. */
  hit: GeocodeHit | null;
  /** Human-readable trail of what matched, for the review page. */
  evidence: string[];
};

export type RuleOptions = {
  /** Country most of this channel's existing cameras are in. */
  priorCountry?: string | null;
  /** Injectable for tests; defaults to Open-Meteo. */
  geocodeFn?: (name: string) => Promise<GeocodeHit[]>;
  /** Shared across a run so repeated segments ("Maine") cost one call. */
  cache?: Map<string, Promise<GeocodeHit[]>>;
};

const MAX_SEGMENTS = 4;
/** Geocoder calls per title (segments + their leading-word prefixes). */
const MAX_LOOKUPS = 7;
/** Leading words that are never a town on their own. */
const GENERIC_WORDS = new Set([
  "lake", "beach", "port", "green", "north", "south", "west", "east", "big", "little",
  "new", "old", "mount", "mt", "saint", "st", "san", "santa", "lower", "upper", "grand",
  "main", "old", "central", "downtown", "city", "bay", "harbor", "harbour", "river", "lago",
]);

const NOISE = /\b(earthcam|earthtv|live now|live cam(era)?|live stream(ing)?|live webcam|livecam|webcam|web cam|camera|cam|live|stream(ing)?|24\/7|4k|hd|uhd|full hd|ultra|ptz|official|now|view of|views?|feed|online|3d)\b|vr\s?180°?|360°/gi;
/** Leading adjectives that are not part of a place name. */
const LEADING_FLUFF = /^(erupting|active|beautiful|stunning|relaxing|amazing|epic|stand before an|stand|life beneath an|watch|watching)\s+/i;
/** Immersive formats render as a warped fisheye in a normal player. */
const IMMERSIVE = /\b(vr\s?180|180°|360°|vr\b|stereoscopic)/i;
const CAM_NUMBER = /\b(cam|camera)\s*[a-z]?\d*\b/gi;

const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho",
  IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
  ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas",
  UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia",
  WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
};

/* ----------------------------- text helpers ----------------------------- */

export function norm(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Split a title into candidate place phrases. */
export function titleSegments(title: string): string[] {
  const cleaned = title
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}✪]/gu, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(CAM_NUMBER, " ")
    .replace(NOISE, " ")
    .replace(/\s+/g, " ");
  const parts = cleaned
    .split(/\s*(?:[|,:()/]|\s[–—\-]\s|\bin\b|\bfrom\b|\bat\b|\bnear\b|\bof\b)\s*/i)
    .map((p) => p.replace(/^[\s'"“”°]+|[\s'"“”.!]+$/g, "").replace(LEADING_FLUFF, "").trim())
    .filter((p) => p.length >= 2 && /\p{L}/u.test(p) && !/^\d+$/.test(p));
  // Keep order, drop exact repeats.
  return [...new Set(parts)];
}

/**
 * Does the segment name this place? Exact after normalisation, or the place
 * name followed by at most two more words ("Hakone Cruise", "Etna Volcano").
 * Never the other way round, so the geocoder's fuzzy hits ("Etna" → Emerson)
 * are thrown away.
 */
function namesPlace(segment: string, hit: GeocodeHit): boolean {
  const a = norm(segment);
  const b = norm(hit.name);
  if (!b) return false;
  if (a === b || a === `${b} city` || b === `${a} city`) return true;
  if (a.startsWith(`${b} `)) {
    const extra = a.slice(b.length).trim().split(" ").length;
    return extra <= 2;
  }
  return false;
}

/* ----------------------------- type mapping ----------------------------- */

const TYPE_KEYWORDS: Array<[RegExp, CameraPrimaryType]> = [
  [/\b(aurora|northern lights|nordlys)\b/i, "aurora"],
  [/\b(volcano|volcan|vulkan|eruption|erupting|crater)\b/i, "volcano"],
  [/\b(ski|chairlift|gondola|slope|piste)\b/i, "ski-resort"],
  [/\b(railway station|train station|bahnhof|station)\b/i, "railway-station"],
  [/\b(railfan|railcam|rail cam|trains?|railway|crossing)\b/i, "railway-view"],
  [/\b(airport|runway|flughafen)\b/i, "airport"],
  [/\b(skating|ice rink|rink)\b/i, "skating-rink"],
  [/\b(skyline|downtown|cityscape|city view|rooftop)\b/i, "city-skyline"],
  [/\b(beach|playa|spiaggia|strand|bay)\b/i, "beach"],
  [/\b(harbou?r|port|marina|pier|wharf|jetty|hafen|porto)\b/i, "harbor"],
  [/\b(lighthouse|castle|cathedral|temple|shrine|basilica|monument|memorial|palace|tower|bridge|square|piazza|plaza)\b/i, "cultural-landmark"],
  [/\b(street|main st|avenue|boulevard|old town|market|crossroad|intersection)\b/i, "street"],
  [/\b(mountain|mt\.?|mount|alps|peak|summit|glacier|pass|ridge)\b/i, "mountain"],
  [/\b(river|falls|waterfall|canal)\b/i, "river"],
  [/\b(ocean|sea|surf|coast|coastal|island|reef)\b/i, "ocean"],
  [/\b(village|dorf|hamlet)\b/i, "village"],
  [/\b(lake|lago|see|pond|loch|fjord)\b/i, "nature"],
];

const FEATURE_TYPES: Record<string, CameraPrimaryType> = {
  MT: "mountain", MTS: "mountain", PK: "mountain", VLC: "volcano", LK: "nature",
  BCH: "beach", BAY: "beach", HBR: "harbor", PRT: "harbor", AIRP: "airport",
  RSTN: "railway-station", ISL: "ocean", STM: "river", FLLS: "river", GLCR: "mountain",
};

type Tag = (typeof TAGS)[number];

const TAGS_FOR: Record<CameraPrimaryType, Tag[]> = {
  aurora: ["Aurora", "Arctic Circle"],
  mountain: ["Mountain Range", "Natural Scenery"],
  "ski-resort": ["Ski Resort", "Mountain Range"],
  "cultural-landmark": ["Cultural Landmark"],
  nature: ["Natural Scenery"],
  "railway-station": ["Railway", "Urban"],
  street: ["Street Scene"],
  ocean: ["Coastline"],
  "city-skyline": ["City Skyline"],
  beach: ["Beach", "Coastal"],
  harbor: ["Harbor"],
  "railway-view": ["Railway"],
  village: ["Street Scene", "Natural Scenery"],
  airport: ["Airport"],
  "skating-rink": ["Winter Sports", "Urban"],
  river: ["Natural Scenery"],
  volcano: ["Volcano", "Natural Scenery"],
};

function viewingFor(type: CameraPrimaryType): StreamAnalysis["viewingTime"] {
  const off = { dayOnly: false, nightOnly: false, noSleepTime: false, anytime: false };
  switch (type) {
    case "aurora": return { ...off, nightOnly: true };
    case "city-skyline": case "harbor": case "cultural-landmark": case "volcano": return { ...off, anytime: true };
    case "street": case "railway-station": case "railway-view": case "airport": case "skating-rink": return { ...off, noSleepTime: true };
    default: return { ...off, dayOnly: true };
  }
}

function weatherFor(type: CameraPrimaryType): StreamAnalysis["weatherTolerance"] {
  switch (type) {
    case "ski-resort": case "skating-rink": return { clear: true, partlyCloudy: true, lightRain: false, lightSnow: true };
    case "street": case "railway-station": case "railway-view": case "airport": case "city-skyline": return { clear: true, partlyCloudy: true, lightRain: true, lightSnow: true };
    case "aurora": return { clear: true, partlyCloudy: false, lightRain: false, lightSnow: false };
    default: return { clear: true, partlyCloudy: true, lightRain: false, lightSnow: false };
  }
}

export function classifyType(title: string, featureCode: string | null): CameraPrimaryType {
  for (const [re, type] of TYPE_KEYWORDS) if (re.test(title)) return type;
  if (featureCode && FEATURE_TYPES[featureCode]) return FEATURE_TYPES[featureCode];
  return "nature";
}

/* ------------------------------ the engine ------------------------------ */

export async function analyzeTitleByRules(
  title: string,
  options: RuleOptions = {}
): Promise<RuleAnalysis> {
  const geo = options.geocodeFn ?? geocode;
  const cache = options.cache ?? new Map<string, Promise<GeocodeHit[]>>();
  const lookup = (segment: string) => {
    const key = norm(segment);
    let p = cache.get(key);
    if (!p) {
      p = geo(segment).catch(() => [] as GeocodeHit[]);
      cache.set(key, p);
    }
    return p;
  };

  const compilation =
    /\b(tour|webcams|cameras|compilation|around the world|top \d+|multi[- ]?cam)\b/i.test(title) ||
    IMMERSIVE.test(title);
  const evidence: string[] = [];
  const segments = titleSegments(title).slice(0, MAX_SEGMENTS + 2);

  // Expand US state abbreviations so "FL" can corroborate "Florida".
  const expanded = segments.map((s) => US_STATES[s.toUpperCase()] ?? s);

  // Geocode the first few segments; the geocoder only answers when the
  // query *is* the place name, so also try each segment's leading words
  // ("Etna Volcano" → "Etna"). Hits must still name the segment's place.
  const anchors: Array<{ segment: string; hits: GeocodeHit[] }> = [];
  let lookups = 0;
  for (const segment of expanded.slice(0, MAX_SEGMENTS)) {
    const words = segment.split(/\s+/);
    const queries = [segment];
    for (let n = Math.min(3, words.length - 1); n >= 1; n--) {
      const prefix = words.slice(0, n).join(" ");
      if (n === 1 && (prefix.length < 4 || GENERIC_WORDS.has(prefix.toLowerCase()))) continue;
      queries.push(prefix);
    }
    const hits: GeocodeHit[] = [];
    for (const q of queries) {
      if (lookups >= MAX_LOOKUPS) break;
      lookups++;
      for (const h of await lookup(q)) {
        if (namesPlace(segment, h) && !hits.some((x) => x.name === h.name && x.countryCode === h.countryCode && x.admin1 === h.admin1)) {
          hits.push(h);
        }
      }
      if (hits.length) break;
    }
    if (hits.length) anchors.push({ segment, hits });
  }

  const others = (seg: string) => expanded.filter((s) => s !== seg);
  const mentions = (text: string, hit: GeocodeHit) => {
    const t = norm(text);
    const words = t.split(" ");
    if (hit.admin1 && (t === norm(hit.admin1) || ` ${t} `.includes(` ${norm(hit.admin1)} `))) return true;
    return [text, ...words].some((w) => sameCountry(w, hit.country) || sameCountry(w, hit.countryCode));
  };
  const corroborates = (hit: GeocodeHit, seg: string) =>
    others(seg).some((s) => mentions(s, hit)) ||
    // "Sicily Italy" — country in the same segment as the place.
    (norm(seg) !== norm(hit.name) && mentions(seg.replace(new RegExp(hit.name, "i"), ""), hit));

  // Score every exact hit; the best one is the anchor.
  let best: { hit: GeocodeHit; segment: string; score: number } | null = null;
  for (const { segment, hits } of anchors) {
    for (const hit of hits) {
      let score = 0.55;
      const c = corroborates(hit, segment);
      const prior = options.priorCountry ? sameCountry(options.priorCountry, hit.country) : false;
      if (c) score += 0.2;
      if (prior) score += 0.15;
      // A big well-known city on its own is more trustworthy than a hamlet.
      if (!c && !prior && hit.population >= 100_000) score += 0.05;
      if (!best || score > best.score) best = { hit, segment, score };
    }
  }

  if (!best) {
    return {
      isFixedOutdoorView: !compilation,
      placename: segments[0] ?? title.slice(0, 60),
      city: null,
      region: null,
      country: options.priorCountry ?? "",
      primaryType: classifyType(title, null),
      tags: TAGS_FOR[classifyType(title, null)],
      resolution: /4k/i.test(title) ? "4k" : "1080p",
      viewingTime: viewingFor(classifyType(title, null)),
      weatherTolerance: weatherFor(classifyType(title, null)),
      confidence: 0.3,
      hit: null,
      evidence: ["no segment geocoded to an exact place"],
    };
  }

  const { hit, segment } = best;
  let confidence = Math.min(0.95, best.score);
  const corroborated = corroborates(hit, segment);
  const priorMatch = Boolean(options.priorCountry && sameCountry(options.priorCountry, hit.country));
  evidence.push(`"${segment}" → ${hit.name}, ${hit.admin1 ?? "?"}, ${hit.country} [${hit.featureCode ?? "?"}]`);
  if (corroborated) evidence.push("corroborated by state/country in title");
  if (priorMatch) evidence.push(`channel usually in ${options.priorCountry}`);

  // An exact town in another country and nothing (title or channel) to
  // break the tie: the title is ambiguous, say so.
  const rival = anchors
    .flatMap((a) => a.hits.map((h) => ({ h, seg: a.segment })))
    .find(({ h }) => !sameCountry(h.country, hit.country) && !corroborated && !priorMatch);
  if (rival) {
    confidence -= 0.25;
    evidence.push(`ambiguous: could also be ${rival.h.name}, ${rival.h.country}`);
  }

  // The placename is the first segment before the anchor that is not just
  // a state/country ("Nubble Lighthouse" before "York"). When the anchor
  // comes first, the segment's own extra words ("Paris downtown") or the
  // town name serve.
  const anchorIndex = expanded.indexOf(segment);
  const descriptive = segments
    .slice(0, Math.max(0, anchorIndex))
    .find((s) => !mentions(s, hit) || namesPlace(s, hit) === false && !/^[A-Z]{2}$/.test(s) && !mentions(s, hit));
  const placename = descriptive ?? (norm(segment) === norm(hit.name) ? hit.name : segment);
  if (descriptive) confidence = Math.min(0.95, confidence + 0.05);

  const type = classifyType(title, hit.featureCode);
  const isTown = !hit.featureCode || hit.featureCode.startsWith("PPL");

  return {
    isFixedOutdoorView: !compilation,
    placename,
    city: isTown ? hit.name : hit.admin3 ?? hit.admin2 ?? hit.name,
    region: hit.admin1,
    country: hit.country,
    primaryType: type,
    tags: TAGS_FOR[type],
    resolution: /4k/i.test(title) ? "4k" : "1080p",
    viewingTime: viewingFor(type),
    weatherTolerance: weatherFor(type),
    confidence,
    hit,
    evidence,
  };
}
