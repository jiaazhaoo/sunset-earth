import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchChannelLiveCandidates, searchLiveVideos } from "@/lib/youtube";
import channel from "./fixtures/channel-streams.json";
import search from "./fixtures/search-results.json";

// Fixtures are trimmed copies of real pages (2026-09-17): a channel /streams
// tab in YouTube's current lockupViewModel markup, and a live-filtered search
// results page in the older videoRenderer markup. The third item in each is
// not live and must be ignored.
function page(data: unknown) {
  return `<html><script>var ytInitialData = ${JSON.stringify(data)};</script></html>`;
}

afterEach(() => vi.unstubAllGlobals());

describe("fetchChannelLiveCandidates", () => {
  it("requests the /streams tab and reads lockupViewModel live badges", async () => {
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(async () => new Response(page(channel), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const live = await fetchChannelLiveCandidates("https://www.youtube.com/@earthcam/streams");

    expect(fetchMock.mock.calls[0][0]).toBe("https://www.youtube.com/@earthcam/streams");
    expect(live.map((l) => l.videoId)).toEqual(["1LKfIz99wBQ", "Xw8CoRwNfXs"]);
    expect(live[0].title).toMatch(/EarthCam Live/);
  });

  it("never builds '/streams/live' from a host_link that already names a tab", async () => {
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(async () => new Response(page(channel), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await fetchChannelLiveCandidates("https://www.youtube.com/@earthcam/live/");
    expect(fetchMock.mock.calls[0][0]).toBe("https://www.youtube.com/@earthcam/streams");
  });

  it("returns nothing on a non-200", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    expect(await fetchChannelLiveCandidates("https://www.youtube.com/@gone")).toEqual([]);
  });
});

describe("searchLiveVideos", () => {
  it("applies the live filter and keeps only BADGE_STYLE_TYPE_LIVE_NOW results with their channel", async () => {
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(async () => new Response(page(search), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const live = await searchLiveVideos("Western Wall Jerusalem live cam");

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("search_query=Western%20Wall%20Jerusalem%20live%20cam");
    expect(url).toContain("sp=EgJAAQ");
    expect(live).toEqual([
      expect.objectContaining({ videoId: "77akujLn4k8", channelUrl: "https://www.youtube.com/@earthcam" }),
      expect.objectContaining({ videoId: "zp6LNSoq000" }),
    ]);
  });
});
