import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;

// Enables access to the Cloudflare context (env, bindings) during `next dev`
// via `getCloudflareContext()`. No-op outside of local development.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
void initOpenNextCloudflareForDev();
