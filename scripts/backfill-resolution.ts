/**
 * Read each camera's tallest stream format from a workstation and store it in
 * camera_ytb.max_height. The hourly sweep does the same from the Worker, but
 * YouTube answers data-centre IPs with LOGIN_REQUIRED far more often than a
 * home connection, and then the watch page carries no format list.
 *
 *   npx tsx scripts/backfill-resolution.ts          # writes to the remote DB
 *   npx tsx scripts/backfill-resolution.ts --dry    # print only
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const CONCURRENCY = 6;

function d1(sql: string): unknown[] {
  const out = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", "sunset-earth", "--remote", "--json", "--command", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
  );
  const parsed = JSON.parse(out) as Array<{ results: unknown[] }>;
  return parsed[0]?.results ?? [];
}

async function maxHeight(videoId: string): Promise<number | null> {
  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
  });
  if (!res.ok) return null;
  const html = await res.text();
  const match = html.match(/ytInitialPlayerResponse\s*=\s*(\{[\s\S]+?\})\s*;/);
  if (!match) return null;
  try {
    const data = JSON.parse(match[1]) as {
      streamingData?: { adaptiveFormats?: Array<{ height?: number }>; formats?: Array<{ height?: number }> };
    };
    const heights = [...(data.streamingData?.adaptiveFormats ?? []), ...(data.streamingData?.formats ?? [])]
      .map((f) => f.height ?? 0)
      .filter((h) => h > 0);
    return heights.length ? Math.max(...heights) : null;
  } catch {
    return null;
  }
}

async function main() {
  const dry = process.argv.includes("--dry");
  const rows = d1(
    `SELECT camera_id, link FROM camera_ytb WHERE link_available = 1 AND retired_at IS NULL`
  ) as Array<{ camera_id: string; link: string | null }>;
  const targets = rows
    .map((r) => ({ id: String(r.camera_id), videoId: r.link?.match(/[?&]v=([\w-]{11})/)?.[1] ?? null }))
    .filter((t): t is { id: string; videoId: string } => Boolean(t.videoId));

  const results: Array<{ id: string; height: number | null }> = [];
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    results.push(...(await Promise.all(batch.map(async (t) => ({ id: t.id, height: await maxHeight(t.videoId) })))));
  }

  const known = results.filter((r): r is { id: string; height: number } => r.height !== null);
  const dist = new Map<number, number>();
  for (const r of known) dist.set(r.height, (dist.get(r.height) ?? 0) + 1);
  console.log(`${known.length}/${targets.length} read`, [...dist.entries()].sort((a, b) => a[0] - b[0]));
  console.log("below 1080p:", known.filter((r) => r.height < 1080).map((r) => `${r.id}:${r.height}p`).join(" ") || "none");
  if (dry || !known.length) return;

  const sql = known
    .map((r) => `UPDATE camera_ytb SET max_height = ${r.height} WHERE camera_id = '${r.id.replace(/'/g, "''")}';`)
    .join("\n");
  const file = join(mkdtempSync(join(tmpdir(), "sunset-")), "max_height.sql");
  writeFileSync(file, sql);
  execFileSync("npx", ["wrangler", "d1", "execute", "sunset-earth", "--remote", "--file", file], { stdio: "inherit" });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
