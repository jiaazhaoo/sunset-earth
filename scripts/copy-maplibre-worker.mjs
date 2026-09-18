// MapLibre resolves its tile-parsing worker as `new URL("./maplibre-gl-worker.mjs",
// import.meta.url)`, which under a bundler points into /_next/static/chunks and
// 404s. We serve the worker (and the shared module it imports) as static files
// instead and point MapLibre at them with setWorkerUrl. Runs before every build.
import { copyFileSync, mkdirSync } from "node:fs";

const src = "node_modules/maplibre-gl/dist";
const dst = "public/vendor/maplibre";
mkdirSync(dst, { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(`${src}/${f}`, `${dst}/${f}`);
}
console.log("copied maplibre worker to", dst);
