// Augments the wrangler-generated `CloudflareEnv` (worker-configuration.d.ts)
// with secret bindings, which `wrangler types` cannot infer because secrets
// are not declared in wrangler.jsonc. Set these via `wrangler secret put`.
interface CloudflareEnv {
  CRON_SECRET?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  CLOUDFLARE_REALTIME_API_BASE?: string;
  CLOUDFLARE_BASIC_AUTH?: string;
  CLOUDFLARE_REALTIME_PRESET?: string;
  DAILY_API_KEY?: string;
  DAILY_DOMAIN?: string;
}
