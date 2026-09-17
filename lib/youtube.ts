const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export type LiveVideoInfo = {
  videoId: string;
  title: string;
  /** Channel URL ("https://www.youtube.com/@handle") when the source has it. */
  channelUrl?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export async function fetchChannelLiveVideo(
  channelUrl: string
): Promise<LiveVideoInfo | null> {
  const candidates = await fetchChannelLiveCandidates(channelUrl);
  return candidates.length ? candidates[0] : null;
}

export async function fetchChannelLiveCandidates(
  channelUrl: string
): Promise<LiveVideoInfo[]> {
  if (!channelUrl) {
    return [];
  }

  // Fetch the channel's /streams tab: it lists every current live stream,
  // whereas /live only exposes the one the channel chose to feature. Strip any
  // tab already on the stored host_link so we never build "/streams/live".
  const normalized = channelUrl
    .replace(/\/+$/, "")
    .replace(/\/(live|streams|videos|featured)$/, "");
  const liveUrl = `${normalized}/streams`;

  const response = await fetch(liveUrl, {
    headers: {
      "User-Agent": USER_AGENT,
      accept: "text/html",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    console.warn("[youtube] failed to load live page", response.status);
    return [];
  }

  const html = await response.text();
  const candidates: LiveVideoInfo[] = [];

  const playerResponse = extractJson(html, "ytInitialPlayerResponse");
  if (playerResponse) {
    const data = playerResponse as {
      videoDetails?: { videoId?: string; title?: string; isLiveContent?: boolean };
    };
    if (data.videoDetails?.isLiveContent && data.videoDetails.videoId) {
      candidates.push({
        videoId: data.videoDetails.videoId,
        title: data.videoDetails.title ?? "",
      });
    }
  }

  const initialData = extractJson(html, "ytInitialData");
  if (initialData) {
    const liveBlocks = findLiveRenderer(initialData);
    for (const item of liveBlocks) {
      if (!candidates.find((candidate) => candidate.videoId === item.videoId)) {
        candidates.push(item);
      }
    }
  }

  return candidates;
}

/**
 * YouTube search restricted to streams that are live right now (the
 * `sp=EgJAAQ==` filter). Used as a fallback when a camera's host channel no
 * longer carries a matching stream.
 */
export async function searchLiveVideos(query: string): Promise<LiveVideoInfo[]> {
  const url =
    "https://www.youtube.com/results?search_query=" +
    encodeURIComponent(query) +
    "&sp=EgJAAQ%253D%253D";
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      accept: "text/html",
      "accept-language": "en-US,en;q=0.9",
    },
    cache: "no-store",
  });
  if (!response.ok) {
    console.warn("[youtube] search failed", response.status);
    return [];
  }
  const initialData = extractJson(await response.text(), "ytInitialData");
  return initialData ? findLiveRenderer(initialData) : [];
}

function extractJson(html: string, key: string) {
  const pattern = new RegExp(
    `${key}\\s*=\\s*(\\{[\\s\\S]+?\\})\\s*;`,
    "m"
  );
  const match = html.match(pattern);
  if (!match) {
    return null;
  }
  try {
    return JSON.parse(match[1]);
  } catch (error) {
    console.warn("[youtube] failed to parse json for", key, error);
    return null;
  }
}

type YoutubeNode = Record<string, unknown>;

function findLiveRenderer(raw: unknown): LiveVideoInfo[] {
  // YouTube has shipped two markups for the /streams grid: the legacy
  // `videoRenderer` (with thumbnailOverlays) and, since 2025, `lockupViewModel`
  // (with thumbnailBadgeViewModel). Rather than track the exact tab/section
  // nesting, which also changes, walk the whole tree and accept either shape.
  const candidates: LiveVideoInfo[] = [];
  const seen = new Set<string>();
  const push = (videoId: string, title: string, channelUrl?: string) => {
    if (!seen.has(videoId)) {
      seen.add(videoId);
      candidates.push(channelUrl ? { videoId, title, channelUrl } : { videoId, title });
    }
  };

  const walk = (node: unknown, depth: number) => {
    if (depth > 60) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    if (!isRecord(node)) return;

    const renderer = node["videoRenderer"];
    if (isRecord(renderer)) {
      const videoId = getString(renderer["videoId"]);
      if (videoId && hasLiveBadge(renderer)) {
        push(videoId, extractTitle(renderer), extractChannelUrl(renderer));
      }
    }

    const lockup = node["lockupViewModel"];
    if (isRecord(lockup)) {
      const videoId = getString(lockup["contentId"]);
      const type = getString(lockup["contentType"]);
      if (
        videoId &&
        (type === null || type === "LOCKUP_CONTENT_TYPE_VIDEO") &&
        lockupIsLive(lockup)
      ) {
        push(videoId, extractLockupTitle(lockup));
      }
      return; // no live markers nest deeper than the lockup itself
    }

    for (const value of Object.values(node)) walk(value, depth + 1);
  };

  try {
    walk(raw, 0);
  } catch (error) {
    console.warn("[youtube] failed to search live renderer", error);
  }
  return candidates;
}

/** Does any thumbnailBadgeViewModel inside the lockup carry the LIVE style? */
function lockupIsLive(lockup: YoutubeNode): boolean {
  let live = false;
  const walk = (node: unknown, depth: number) => {
    if (live || depth > 30) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    if (!isRecord(node)) return;
    const badge = node["thumbnailBadgeViewModel"];
    if (
      isRecord(badge) &&
      getString(badge["badgeStyle"]) === "THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE"
    ) {
      live = true;
      return;
    }
    for (const value of Object.values(node)) walk(value, depth + 1);
  };
  walk(lockup["contentImage"], 0);
  return live;
}

function extractLockupTitle(lockup: YoutubeNode): string {
  const metadata = lockup["metadata"];
  if (!isRecord(metadata)) return "";
  const view = metadata["lockupMetadataViewModel"];
  if (!isRecord(view)) return "";
  const title = view["title"];
  return isRecord(title) ? getString(title["content"]) ?? "" : "";
}

function hasLiveBadge(renderer: YoutubeNode) {
  // Search results flag live streams with a metadata badge...
  const badges = renderer["badges"];
  if (Array.isArray(badges)) {
    const liveNow = badges.some((badge) => {
      if (!isRecord(badge)) return false;
      const meta = badge["metadataBadgeRenderer"];
      return isRecord(meta) && meta["style"] === "BADGE_STYLE_TYPE_LIVE_NOW";
    });
    if (liveNow) return true;
  }
  // ...while channel grids (legacy markup) used a thumbnail overlay.
  const overlays = renderer["thumbnailOverlays"];
  if (!Array.isArray(overlays)) {
    return false;
  }
  return overlays.some((overlay) => {
    if (!isRecord(overlay)) {
      return false;
    }
    const timeStatus = overlay["thumbnailOverlayTimeStatusRenderer"];
    if (isRecord(timeStatus) && timeStatus["style"] === "LIVE") {
      return true;
    }
    const badge = overlay["thumbnailOverlayBadgeRenderer"];
    return isRecord(badge) && badge["style"] === "LIVE";
  });
}

function extractChannelUrl(renderer: YoutubeNode): string | undefined {
  const owner = renderer["ownerText"];
  if (!isRecord(owner)) return undefined;
  const runs = owner["runs"];
  if (!Array.isArray(runs) || !isRecord(runs[0])) return undefined;
  const nav = runs[0]["navigationEndpoint"];
  if (!isRecord(nav)) return undefined;
  const browse = nav["browseEndpoint"];
  if (!isRecord(browse)) return undefined;
  const base = getString(browse["canonicalBaseUrl"]);
  return base ? `https://www.youtube.com${base}` : undefined;
}

function extractTitle(renderer: YoutubeNode) {
  const titleNode = renderer["title"];
  if (!isRecord(titleNode)) {
    return "";
  }
  const runs = titleNode["runs"];
  if (Array.isArray(runs)) {
    for (const run of runs) {
      if (isRecord(run)) {
        const text = getString(run["text"]);
        if (text) {
          return text;
        }
      }
    }
  }
  return getString(titleNode["simpleText"]) ?? "";
}

export function calculateSimilarity(a: string, b: string) {
  const cleanA = (a || "").toLowerCase();
  const cleanB = (b || "").toLowerCase();
  if (!cleanA && !cleanB) {
    return 1;
  }
  const longer = cleanA.length >= cleanB.length ? cleanA : cleanB;
  const shorter = cleanA.length >= cleanB.length ? cleanB : cleanA;
  const longerLength = longer.length;
  if (longerLength === 0) {
    return 1;
  }
  const distance = levenshtein(longer, shorter);
  return (longerLength - distance) / longerLength;
}

/**
 * Smart similarity calculation that handles:
 * - Emojis and special characters
 * - Different title formats (marketing vs. descriptive)
 * - Location-based matching with geographic knowledge
 */
// Words that carry no location signal in a stream title.
const TITLE_STOP_WORDS = new Set([
  "live", "stream", "streaming", "24", "hd", "4k", "camera", "cam", "webcam",
  "view", "relaxing", "music", "watch", "now", "the", "a", "an", "in", "at",
  "on", "of", "and", "or", "to", "from", "with", "new", "old", "us", "usa",
]);

// Locations that different channels spell differently.
const LOCATION_SYNONYMS: Record<string, string[]> = {
  yellowstone: ["yellowstone", "geyser", "basin", "faithful", "geysir"],
  zermatt: ["zermatt", "matterhorn"],
  iceland: ["iceland", "reykjavik", "islanda"],
  volcano: ["volcano", "vulkan", "vulcano", "volcan"],
  harbour: ["harbour", "harbor", "port", "hafen"],
  mountain: ["mountain", "mount", "mt", "berg", "mont", "monte"],
  street: ["street", "st"],
  saint: ["saint", "st", "san", "santa", "sankt"],
};

// Generic geography words that appear in half the titles on a channel. They
// still count, but at half weight, so "Port of Saint-Malo" cannot match
// "Saint-Quay-Portrieux - Le Port" on "port" + "saint" alone.
const WEAK_WORDS = new Set([
  "saint", "st", "san", "santa", "port", "lake", "beach", "mount", "mountain",
  "city", "bay", "harbor", "harbour", "island", "park", "river", "bridge",
  "square", "tower", "street", "downtown", "north", "south", "east", "west",
]);

function titleKeywords(text: string): string[] {
  return text
    .toLowerCase()
    // Keep letters/digits in any script so non-Latin titles still yield words.
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1 && !TITLE_STOP_WORDS.has(word));
}

function expandSynonyms(words: Iterable<string>): Set<string> {
  const expanded = new Set(words);
  for (const word of [...expanded]) {
    for (const group of Object.values(LOCATION_SYNONYMS)) {
      if (group.includes(word)) group.forEach((w) => expanded.add(w));
    }
  }
  return expanded;
}

/** Weighted fraction of `reference` keywords found in `candidate` (0..1). */
function keywordCoverage(reference: string, candidate: Set<string>): number {
  const words = titleKeywords(reference);
  if (!words.length) return 0;
  let total = 0;
  let hits = 0;
  for (const word of words) {
    const weight = WEAK_WORDS.has(word) ? 0.5 : 1;
    total += weight;
    if (candidate.has(word)) hits += weight;
  }
  return hits / total;
}

/**
 * How well a live-stream title matches a camera's curated location.
 *
 * Stream titles are verbose ("Boston Weather Cam, MA Live Cam - Green Line")
 * while our reference is short ("Green Line", Boston), so symmetric measures
 * like Jaccard punish every extra word in the title. Instead score how much of
 * the *reference* the title covers, weighting the place name over the city:
 * the name is what distinguishes cameras on the same channel.
 */
export function calculatePlaceMatch(
  placeName: string,
  city: string | null | undefined,
  candidateTitle: string
): number {
  const candidate = expandSynonyms(titleKeywords(candidateTitle));
  // Multi-camera tours and "top N webcams" compilations mention many places;
  // they are never the fixed view a camera row describes.
  const compilation = /\b(tour|webcams|cameras|compilation|around the world|top \d+)\b/i.test(
    candidateTitle
  );
  const penalty = compilation ? 0.5 : 1;
  const nameScore = keywordCoverage(placeName, candidate);
  // The city only adds confidence once the place name itself half-matches;
  // otherwise any stream in the same city ("Chicago") would clear the bar.
  if (!city || nameScore < 0.5) return penalty * 0.7 * nameScore;
  const cityScore = keywordCoverage(city, candidate);
  return penalty * (0.7 * nameScore + 0.3 * cityScore);
}

export function calculateSmartSimilarity(reference: string, candidate: string): number {
  // Remove emojis and special characters
  const cleanRef = reference
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const cleanCand = candidate
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Extract meaningful keywords (filter out common words)
  const stopWords = new Set([
    "live", "stream", "24", "7", "hd", "4k", "camera", "cam", "view",
    "relaxing", "music", "watch", "now", "the", "a", "an", "in", "at",
    "on", "of", "and", "or", "to", "from", "with", "new", "old"
  ]);

  // Geographic synonyms - locations that refer to the same place
  const locationSynonyms: Record<string, string[]> = {
    "yellowstone": ["yellowstone", "geyser", "basin", "faithful", "geysir"],
    "zermatt": ["zermatt", "matterhorn"],
    "iceland": ["iceland", "reykjavik", "islanda"],
    "volcano": ["volcano", "vulkan", "vulcano", "volcan"],
    "harbour": ["harbour", "harbor", "port", "hafen"],
    "mountain": ["mountain", "berg", "mont", "monte"],
  };

  const extractKeywords = (text: string) => {
    return text
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word))
      .filter(Boolean);
  };

  const refKeywords = extractKeywords(cleanRef);
  const candKeywords = extractKeywords(cleanCand);

  // If no keywords, fall back to basic similarity
  if (refKeywords.length === 0 || candKeywords.length === 0) {
    return calculateSimilarity(reference, candidate);
  }

  // Build expanded keyword sets with synonyms
  const expandWithSynonyms = (keywords: string[]) => {
    const expanded = new Set(keywords);
    for (const word of keywords) {
      for (const synonyms of Object.values(locationSynonyms)) {
        if (synonyms.includes(word)) {
          synonyms.forEach(syn => expanded.add(syn));
        }
      }
    }
    return expanded;
  };

  const refExpanded = expandWithSynonyms(refKeywords);
  const candExpanded = expandWithSynonyms(candKeywords);

  // Calculate keyword overlap (Jaccard similarity)
  const intersection = new Set(
    [...refExpanded].filter(word => candExpanded.has(word))
  );
  const union = new Set([...refExpanded, ...candExpanded]);
  const keywordSimilarity = intersection.size / union.size;

  // Calculate basic string similarity
  const stringSimilarity = calculateSimilarity(cleanRef, cleanCand);

  // Weighted combination: favor keyword matching for different title styles
  // If keyword similarity is high, trust it more
  return Math.max(
    keywordSimilarity * 0.7 + stringSimilarity * 0.3,
    stringSimilarity
  );
}

function levenshtein(a: string, b: string) {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}
