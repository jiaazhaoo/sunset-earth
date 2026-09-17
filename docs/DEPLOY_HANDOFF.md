# Deploy handoff — finish the Cloudflare rollout

This project was migrated off Vercel and Supabase in a **cloud** Claude Code
session, which had no access to the owner's Cloudflare credentials. All the code
work is done and pushed. What remains needs a machine that is logged in with
`wrangler login` — i.e. a **local** session.

Branch: `claude/project-restart-review-aqb9rc`

---

## State: what is already done

- **Vercel removed.** Deploys via OpenNext (`@opennextjs/cloudflare`) to
  Cloudflare Workers. `wrangler.jsonc`, `open-next.config.ts` and a custom
  `worker.ts` (fetch + scheduled) are committed.
- **Cron moved to Cloudflare Cron Triggers.** `worker.ts`'s `scheduled()`
  dispatches three schedules to `/api/replace-link` (hourly),
  `/api/weather-cache` (3-hourly) and `/api/compute-rankings` (every 5 min).
- **Supabase removed.** All 61 query sites rewritten to raw SQL on a D1 binding
  (`env.DB`) via `lib/db.ts`. `@supabase/supabase-js` is uninstalled.
- **Chat rooms removed** along with the 4 `@cloudflare/realtimekit` packages.
- **D1 database already created** by the owner:
  `sunset-earth`, id `d270a188-ef17-4392-991e-b78d567b55f3`, region WEUR.
  It is already filled in at `wrangler.jsonc` → `d1_databases[0]`.
  **The binding must stay `DB`** — `lib/db.ts` reads `env.DB`. (`wrangler d1
  create` offers to append a second entry named `sunset_earth`; decline/delete it.)
- **Schema and seed data committed**: `d1/schema.sql` (4 tables) and
  `d1/seed-cameras.sql` (all 156 cameras exported from the old Supabase).
- Verified in the cloud session: `tsc` (app + worker) clean, `opennextjs-cloudflare
  build` succeeds, and schema + seeds load into a local D1 with matching row
  counts, normalized timestamps and intact JSON.

---

## Status update — 2026-09-17 (local session)

Deployed and verified. Live at **https://sunset-earth.com** (and `www.`);
the `workers.dev` hostname is disabled.

- Custom domains are declared in `wrangler.jsonc` → `routes`. Attaching them
  required deleting the old Vercel `A` / `CNAME` records in the dashboard first;
  the two `_vercel.` TXT verification records were left in place (harmless).

- The D1 database was **not** empty: it already held 156 cameras with
  `last_check = 2026-08-30` from an earlier deploy attempt that day. That data is
  newer than `d1/seed-cameras.sql`, so the seed was not applied.
- `d1/seed-cameras.sql` originally wrapped the inserts in `BEGIN TRANSACTION`/
  `COMMIT`, which remote D1 rejects (local D1 accepts it). Both the seed and
  `d1/csv-to-sql.mjs` now emit plain statements; wrangler applies a `--file`
  import atomically anyway.
- `CRON_SECRET` was rotated (old value unknown) and saved to `.dev.vars`.
- `refresh-links`, `weather-cache` and `compute-rankings` all ran cleanly;
  `rankings-health` reports 113 available cameras. The 5-minute cron trigger
  fired on its own within minutes of deploy.
- Homepage plays a live stream and "Next camera" switches correctly.

### Follow-up the same day: availability pipeline fixes

- Browsers could demote any camera globally (unauthenticated report on every
  player error or 5 s timeout) — now server-verified, cooldown-limited, and
  no longer fans out to replace-link. `/api/dev/*`, `/dev/*` are hidden in
  production (`ENABLE_DEV_ROUTES=1` to expose); `check-camera` and
  `refresh-camera` require `CRON_SECRET`.
- `replace-link` had never repaired anything: it skipped any camera whose
  stream probed as `playability_blocked` (i.e. every dead stream), built
  `<host_link>/streams/live` URLs, and parsed YouTube's old `videoRenderer`
  markup. It now fetches `/streams`, parses `lockupViewModel`, matches on
  `placename + city` (never `ytb_title`, which had drifted), refuses to give
  two cameras the same stream, and caches each channel page per run.
- Data cleanup: 156 links were probed from a workstation as ground truth;
  duplicate streams and cameras showing the wrong location were demoted and
  re-matched.
- `replace-link` now falls back to YouTube search (`<placename> <city> live
  cam`, live-only filter) when the host channel has nothing, with a stricter
  0.7 match bar, and moves `host_link` to the new channel. Streams whose owner
  disabled embedding (`playableInEmbed=false`, player error 150) are rejected
  server-side. `scripts/find-replacements.ts` dry-runs the same logic from a
  workstation. Result: 124 available cameras, all distinct streams; the 32
  still down have no live stream of that place anywhere on YouTube.

---

## What is left (needs Cloudflare auth)

Run from the project root, on a machine where `npx wrangler whoami` shows the
account (run `npx wrangler login` first if not).

```bash
# 0. make sure the local checkout matches origin
git checkout claude/project-restart-review-aqb9rc
git checkout -- wrangler.jsonc      # discard any edit `wrangler d1 create` made
git pull
npm install

# 1. generate the binding types (worker-configuration.d.ts is gitignored)
npm run cf-typegen

# 2. create the tables
npx wrangler d1 execute sunset-earth --remote --file=d1/schema.sql

# 3. import the 156 cameras
npx wrangler d1 execute sunset-earth --remote --file=d1/seed-cameras.sql

# 4. verify: expect cameras = 156, available = 0 (see the warning below)
npx wrangler d1 execute sunset-earth --remote \
  --command "SELECT COUNT(*) AS cameras, SUM(link_available) AS available FROM camera_ytb"

# 5. set the cron secret (any long random string; keep a copy for step 7)
npx wrangler secret put CRON_SECRET

# 6. deploy — prints the workers.dev URL
npm run deploy
```

### 7. Re-validate the camera links — do not skip this

**Every one of the 156 imported cameras has `link_available = false`.** That is
how they were exported: the last availability check in the old database was
dated 2026-03-11, and the project sat idle afterwards. Until the links are
re-checked the homepage has nothing to show.

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" https://<deployed-url>/api/refresh-links
curl -H "Authorization: Bearer <CRON_SECRET>" https://<deployed-url>/api/weather-cache
curl -H "Authorization: Bearer <CRON_SECRET>" https://<deployed-url>/api/compute-rankings
curl https://<deployed-url>/api/rankings-health
```

`refresh-links` restores `link_available` for streams that are still live;
`replace-link` (hourly cron) then tries to repair the rest by crawling each
camera's `host_link` channel. Expect real losses — YouTube live streams do not
survive six months of neglect. Then open the site and confirm a camera plays.

---

### Later the same day: probing pipeline and hygiene

- Live YouTube probes moved out of `compute-rankings` (every 5 min, 74 s)
  into the hourly `replace-link`, which now verifies every on-air camera
  first and repairs the down ones second. `lib/linkHealth.ts` owns the
  demotion policy: definitive YouTube verdicts demote at once, soft failures
  need two strikes (`camera_ytb.consecutive_failures`, migration
  `d1/migrations/0001_consecutive_failures.sql`). `compute-rankings` now
  runs in ~5 s and trusts `link_available`.
- Two scoring bugs fixed in `lib/client-ranking-v2.ts`: sun times were read
  as UTC for `next_event_time`, and the daytime check paired tomorrow's
  sunrise with today's sunset, scoring day-only cameras ~9 instead of ~94 in
  the half hour before sunset. `lib/time.ts` is the single timezone parser.
- Hygiene: ESLint scoped to source (10,211 → 0 problems), 48 vitest tests
  (`npm test`), GitHub Actions CI, v1 ranking + its dev tool deleted, root
  reports and one-off debug scripts archived, README rewritten for the
  Cloudflare stack.

## Things that are likely to bite

- **`npm install` script blocking.** Recent npm versions block postinstall
  scripts; `workerd` and `esbuild` need theirs to fetch platform binaries. If
  `npm run deploy` fails with a missing binary, run
  `npm install-scripts approve workerd esbuild sharp unrs-resolver`
  (check `npm install-scripts ls` for the exact syntax) then `npm rebuild`.
- **Paid Workers plan.** `wrangler.jsonc` sets `limits.cpu_ms = 300000` because
  the cron routes iterate every camera. The free plan caps CPU at 10 ms and
  subrequests at 50 per invocation, which the batch crons exceed. The site
  itself runs fine on free; only those three cron routes need the paid plan.
  If staying on free, the fix is to make the crons cursor-based (process ~10
  cameras per tick and store the offset) rather than sweeping all of them.
- **`SITE_URL` is optional.** Nothing calls the deployment by hostname any more,
  so there is no post-deploy config step.

## Known gaps, deliberately left

- `get_avg_score()` (a Postgres stored function used by `/api/rankings-health`)
  was not in the repo, so it was reimplemented as
  `AVG(score) WHERE available = 1`. If the original had different filtering the
  number will differ; the assumption is commented in the route.
- ~45 pre-existing ESLint errors (`any`, unused vars) remain. They do not block
  the build.
- `lib/client-ranking.ts` (v1) and `lib/client-ranking-v2.ts` still coexist:
  production scoring uses v2, the `/api/dev/live-rankings` tool uses v1, so the
  dev tool reports different scores than the live site.

## Reference

- `d1/README.md` — database setup, import, ad-hoc queries
- `docs/CLOUDFLARE_MIGRATION_PLAN.md` — why each decision was made
- `docs/archive/PROJECT_HEALTH_REVIEW.md` — the original restart assessment
