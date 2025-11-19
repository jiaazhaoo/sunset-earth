const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export type LiveVideoInfo = {
  videoId: string;
  title: string;
};

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
    const liveCard = findLiveRenderer(initialData);
    if (liveCard?.videoId) {
      return {
        videoId: liveCard.videoId,
        title: liveCard.title ?? "",
      };
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

function findLiveRenderer(raw: unknown) {
  try {
    if (
      typeof raw !== "object" ||
      raw === null ||
      !("contents" in raw)
    ) {
      return null;
    }
    const data = raw as { contents?: YoutubeNode };
    const contents =
      (data.contents as YoutubeNode | undefined)?.twoColumnBrowseResultsRenderer
        ?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents;
    if (!Array.isArray(contents)) {
      return null;
    }
    for (const block of contents) {
      const items =
        block?.itemSectionRenderer?.contents ??
        block?.richGridRenderer?.contents ??
        [];
      for (const item of items) {
        const renderer =
          item?.videoRenderer ??
          item?.richItemRenderer?.content?.videoRenderer ??
          null;
        if (!renderer) continue;
        const overlays: YoutubeNode[] = renderer.thumbnailOverlays ?? [];
        const hasLiveBadge = overlays.some((overlay) => {
          const style =
            overlay?.thumbnailOverlayTimeStatusRenderer?.style ??
            overlay?.thumbnailOverlayBadgeRenderer?.style;
          return style === "LIVE";
        });
        if (hasLiveBadge && renderer.videoId) {
          const title =
            renderer.title?.runs?.[0]?.text ??
            renderer.title?.simpleText ??
            "";
          return { videoId: renderer.videoId, title };
        }
      }
    }
  } catch (error) {
    console.warn("[youtube] failed to search live renderer", error);
  }
  return null;
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
