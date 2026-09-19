import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Cloudflare/OpenNext build output and generated types.
    ".open-next/**",
    ".wrangler/**",
    "worker-configuration.d.ts",
    // Historical one-off scripts, kept for reference and not compiled.
    "scripts/archive/**",
    // Vendored MapLibre worker, copied verbatim by scripts/copy-maplibre-worker.mjs.
    "public/vendor/**",
  ]),
]);

export default eslintConfig;
