/**
 * Score a folder of live thumbnails with lib/visual.ts and print them ranked,
 * to check the metrics against real frames by eye.
 *
 *   npx tsx scripts/visual-calibrate.ts <dir>
 *
 * <dir> holds <cameraId>.jpg files plus cams.json (camera_id, placename, score,
 * label) and optionally hash1.json/hash2.json (content hashes from two fetches;
 * a difference marks the thumbnail as a real, changing frame).
 */
import { existsSync, readFileSync } from "node:fs";
import { decode } from "jpeg-js";
import { frameStats, scoreFrame } from "../lib/visual";

const dir = process.argv[2];
if (!dir) throw new Error("usage: visual-calibrate.ts <dir>");
const read = (f: string) => (existsSync(`${dir}/${f}`) ? JSON.parse(readFileSync(`${dir}/${f}`, "utf8")) : {});
const cams = read("cams.json") as Array<{ camera_id: string; placename: string; score: number; label: string }>;
const h1 = read("hash1.json") as Record<string, string>;
const h2 = read("hash2.json") as Record<string, string>;

const rows: Array<[number, string]> = [];
for (const c of cams) {
  const f = `${dir}/${c.camera_id}.jpg`;
  if (!existsSync(f)) continue;
  const img = decode(readFileSync(f), { useTArray: true, formatAsRGBA: true });
  const r = scoreFrame(frameStats(img.data, img.width, img.height));
  const live = h1[c.camera_id] && h2[c.camera_id] && h1[c.camera_id] !== h2[c.camera_id] ? "LIVE" : "    ";
  rows.push([
    r.score,
    `${r.score.toFixed(2)} ${live} ${c.camera_id.padStart(3)} ${c.placename.slice(0, 26).padEnd(26)} b${r.brightness.toFixed(2)} c${r.contrast.toFixed(2)} col${r.colorfulness.toFixed(2)} w${r.warm.toFixed(2)} sky${r.sky.toFixed(2)} ${r.notes.join(",")}`,
  ]);
}
rows.sort((a, b) => b[0] - a[0]);
console.log(rows.map((r) => r[1]).join("\n"));
