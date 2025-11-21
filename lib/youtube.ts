const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export type LiveVideoInfo = {
  videoId: string;
  title: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asRecordArray(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export async function fetchChannelLiveVideo(
  channelUrl: string
): Promise<LiveVideoInfo | null> {
  if (!channelUrl) {
    return null;
  }

  const normalized = channelUrl.endsWith("/")
    ? channelUrl.slice(0, -1)
    : channelUrl;
  const liveUrl = normalized.endsWith("/live")
    ? normalized
    : `${normalized}/live`;

  const response = await fetch(liveUrl, {
    headers: {
      "User-Agent": USER_AGENT,
      accept: "text/html",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    console.warn("[youtube] failed to load live page", response.status);
    return null;
  }

  const html = await response.text();
  const playerResponse = extractJson(html, "ytInitialPlayerResponse");
  if (playerResponse) {
    const data = playerResponse as {
      videoDetails?: { videoId?: string; title?: string; isLiveContent?: boolean };
    };
    if (data.videoDetails?.isLiveContent && data.videoDetails.videoId) {
      return {
        videoId: data.videoDetails.videoId,
        title: data.videoDetails.title ?? "",
      };
    }
  }

  const initialData = extractJson(html, "ytInitialData");
  if (initialData) {
    const candidates = findLiveRenderer(initialData);
    if (candidates.length) {
      return candidates[0];
    }
  }

  return null;
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
  try {
    const sectionBlocks = getSectionBlocks(raw);
    if (!sectionBlocks.length) {
      return [] as LiveVideoInfo[];
    }
    const candidates: LiveVideoInfo[] = [];
    for (const block of sectionBlocks) {
      const items = getBlockItems(block);
      for (const item of items) {
        const renderer = getVideoRenderer(item);
        if (!renderer) {
          continue;
        }
        const videoId = getString(renderer["videoId"]);
        if (!videoId) {
          continue;
        }
        if (!hasLiveBadge(renderer)) {
          continue;
        }
        const title = extractTitle(renderer);
        candidates.push({ videoId, title });
      }
    }
    return candidates;
  } catch (error) {
    console.warn("[youtube] failed to search live renderer", error);
  }
  return [];
}

function getSectionBlocks(raw: unknown): YoutubeNode[] {
  if (!isRecord(raw)) {
    return [];
  }
  const contentsNode = raw["contents"];
  if (!isRecord(contentsNode)) {
    return [];
  }
  const twoColumn = contentsNode["twoColumnBrowseResultsRenderer"];
  if (!isRecord(twoColumn)) {
    return [];
  }
  const tabs = asRecordArray(twoColumn["tabs"]);
  const blocks: YoutubeNode[] = [];
  for (const tab of tabs) {
    const tabRenderer = tab["tabRenderer"];
    if (!isRecord(tabRenderer)) {
      continue;
    }
    const content = tabRenderer["content"];
    if (!isRecord(content)) {
      continue;
    }
    const section = content["sectionListRenderer"];
    if (!isRecord(section)) {
      continue;
    }
    blocks.push(...asRecordArray(section["contents"]));
  }
  return blocks;
}

function getBlockItems(block: YoutubeNode): YoutubeNode[] {
  const items: YoutubeNode[] = [];
  const itemSection = block["itemSectionRenderer"];
  if (isRecord(itemSection)) {
    items.push(...asRecordArray(itemSection["contents"]));
  }
  const richGrid = block["richGridRenderer"];
  if (isRecord(richGrid)) {
    items.push(...asRecordArray(richGrid["contents"]));
  }
  return items;
}

function getVideoRenderer(item: YoutubeNode): YoutubeNode | null {
  const directRenderer = item["videoRenderer"];
  if (isRecord(directRenderer)) {
    return directRenderer;
  }
  const richItem = item["richItemRenderer"];
  if (isRecord(richItem)) {
    const content = richItem["content"];
    if (isRecord(content)) {
      const nested = content["videoRenderer"];
      if (isRecord(nested)) {
        return nested;
      }
    }
  }
  return null;
}

function hasLiveBadge(renderer: YoutubeNode) {
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
