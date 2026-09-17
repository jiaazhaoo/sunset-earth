/**
 * Dry-run the stream-replacement logic against the live D1 database from a
 * workstation, without writing anything.
 *
 *   npx tsx scripts/find-replacements.ts            # all unavailable cameras
 *   npx tsx scripts/find-replacements.ts 4 63 84    # specific camera ids
 *
 * Runs the same two-step search as lib/cameraRefresh.ts (host channel, then
 * YouTube search) and prints what each camera would be repaired to, with the
 * place-match score, so borderline matches can be eyeballed before the hourly
 * replace-link cron adopts them. Reads via `wrangler d1 execute --remote`.
 */
import { execFileSync } from "node:child_process";
import { isCameraAvailable } from "../lib/availability";
import {
  calculatePlaceMatch,
  fetchChannelLiveCandidates,
  searchLiveVideos,
  type LiveVideoInfo,
} from "../lib/youtube";
import { buildCameraStub as stub } from "../lib/cameras";

type Row = {
  camera_id: string;
  placename: string;
  city: string | null;
  country: string | null;
  host_link: string | null;
  link: string | null;
};

const CHANNEL_MIN = 0.5;
const SEARCH_MIN = 0.7;

function d1<T>(sql: string): T[] {
  const out = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", "sunset-earth", "--remote", "--json", "--command", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
  );
  return (JSON.parse(out) as Array<{ results: T[] }>)[0].results;
}

function videoId(link: string | null): string | null {
  const m = link?.match(/[?&]v=([\w-]{11})/);
  return m ? m[1] : null;
}


async function main() {
  const ids = process.argv.slice(2);
  const where = ids.length
    ? `camera_id IN (${ids.map((i) => `'${i.replace(/'/g, "")}'`).join(",")})`
    : "link_available = 0";
  const cameras = d1<Row>(
    `SELECT camera_id, placename, city, country, host_link, link FROM camera_ytb WHERE ${where} ORDER BY CAST(camera_id AS INT)`
  );
  const taken = new Set(
    d1<{ link: string }>(`SELECT link FROM camera_ytb WHERE link_available = 1`)
      .map((r) => videoId(r.link))
      .filter((v): v is string => !!v)
  );
  console.log(`${cameras.length} cameras, ${taken.size} streams already in use\n`);

  const channelCache = new Map<string, Promise<LiveVideoInfo[]>>();
  const summary = { channel: 0, search: 0, none: 0 };

  for (const cam of cameras) {
    const label = `${cam.camera_id.padStart(3)} ${cam.placename} / ${cam.city ?? "-"}, ${cam.country ?? "-"}`;
    const pick = async (list: LiveVideoInfo[], min: number) => {
      const scored = list
        .map((l) => ({ ...l, score: calculatePlaceMatch(cam.placename, cam.city, l.title) }))
        .sort((a, b) => b.score - a.score);
      for (const c of scored) {
        if (c.score < min) break;
        if (taken.has(c.videoId)) continue;
        const ok = await isCameraAvailable(stub(c.videoId, c.title));
        if (ok.available) return { ...c, best: scored[0].score };
      }
      return { best: scored[0]?.score ?? 0 } as { best: number; videoId?: string; title?: string; score?: number; channelUrl?: string };
    };

    let hit: Awaited<ReturnType<typeof pick>> | null = null;
    let via = "";
    if (cam.host_link) {
      const key = cam.host_link;
      if (!channelCache.has(key)) channelCache.set(key, fetchChannelLiveCandidates(key).catch(() => []));
      const r = await pick(await channelCache.get(key)!, CHANNEL_MIN);
      if (r.videoId) { hit = r; via = "channel"; }
    }
    if (!hit) {
      const query = [cam.placename, cam.city, "live cam"].filter(Boolean).join(" ");
      const found = await searchLiveVideos(query).catch(() => [] as LiveVideoInfo[]);
      const r = await pick(found, SEARCH_MIN);
      if (r.videoId) { hit = r; via = "search"; }
      else hit = r;
    }

    if (hit?.videoId) {
      taken.add(hit.videoId);
      summary[via as "channel" | "search"]++;
      console.log(`✔ ${label}`);
      console.log(`     ${via.padEnd(7)} ${hit.score!.toFixed(2)}  ${hit.videoId}  ${hit.title!.slice(0, 70)}${hit.channelUrl ? `  (${hit.channelUrl.replace("https://www.youtube.com/", "")})` : ""}`);
    } else {
      summary.none++;
      console.log(`✘ ${label}   (best ${hit?.best.toFixed(2) ?? "0.00"})`);
    }
  }
  console.log(`\nchannel: ${summary.channel}  search: ${summary.search}  unresolved: ${summary.none}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
