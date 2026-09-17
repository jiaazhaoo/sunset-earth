// Augments the wrangler-generated `CloudflareEnv` (worker-configuration.d.ts)
// with bindings `wrangler types` cannot infer: secrets are not declared in
// wrangler.jsonc. Set them with `wrangler secret put <NAME>`.
interface CloudflareEnv {
  /** Bearer token protecting the cron/task API routes. */
  CRON_SECRET?: string;
  /**
   * Optional public base URL of the deployment. Nothing calls the deployment by
   * hostname any more, so this only labels the in-process cron requests.
   */
  SITE_URL?: string;
}
