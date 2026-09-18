# Sunset Earth

Live at **https://sunset-earth.com**. A Next.js site that shows the YouTube
live camera most likely to be in a good golden hour right now, picked from a
curated list of ~150 cameras by weather and distance to sunrise/sunset.

Runs on Cloudflare Workers (via OpenNext) with a D1 database. No Vercel, no
Supabase — see [`docs/CLOUDFLARE_MIGRATION_PLAN.md`](docs/CLOUDFLARE_MIGRATION_PLAN.md)
for the why and [`docs/DEPLOY_HANDOFF.md`](docs/DEPLOY_HANDOFF.md) for what
was done on rollout.

## Develop

```bash
npm install
npm run cf-typegen     # binding types (worker-configuration.d.ts, gitignored)
npm run dev            # Next dev server; reads bindings via getCloudflareContext()
npm test               # vitest: matching, formatting, scoring
npm run lint
```

`.dev.vars` (gitignored) holds `CRON_SECRET`; the same value is set on the
Worker with `wrangler secret put CRON_SECRET`. To preview a production build
against the real database: `npx opennextjs-cloudflare build && npx wrangler dev --remote`.

## Deploy

```bash
npm run deploy         # opennextjs-cloudflare build && deploy
```

`wrangler.jsonc` declares the D1 binding (`DB`), the custom domains, and three
Cron Triggers that `worker.ts` dispatches to API routes:

| Schedule | Route | Purpose |
| --- | --- | --- |
| `*/5 * * * *` | `/api/compute-rankings` | Score every available camera from cached weather |
| `0 */3 * * *` | `/api/weather-cache` | Refresh Open-Meteo forecasts |
| `0 * * * *` | `/api/replace-link` | Probe cameras on air; repair the ones that are down |
| `0 3 * * 1` | `/api/discover` | Find new cameras; retire ones down for 30 days |
| `*/10 * * * *` | `/api/tick` | Sunset reminders (Web Push) and gallery frames |

The cron routes iterate every camera and need the paid Workers plan
(`limits.cpu_ms` in `wrangler.jsonc`); the site itself would run on free.

## How the camera pool stays healthy

Everything that touches `camera_ytb.link_available` goes through
[`lib/linkHealth.ts`](lib/linkHealth.ts):

- **Probe** ([`lib/availability.ts`](lib/availability.ts)): reads YouTube's
  own `playabilityStatus` from the watch page, including `playableInEmbed`
  (the IFrame player's error 150). Definitive verdicts demote immediately;
  soft failures (timeouts, bot-check pages) need two strikes in a row.
- **Repair** ([`lib/cameraRefresh.ts`](lib/cameraRefresh.ts)): for a camera
  that is down, look at its host channel's `/streams` tab, then fall back to a
  YouTube search for `<placename> <city> live cam`. Candidates are scored
  against the curated place name + city
  ([`calculatePlaceMatch`](lib/youtube.ts)) — never against `ytb_title`,
  which is just whatever the camera last showed. No two cameras may share a
  stream. On a search hit `host_link` moves to the new channel.
- **Viewer reports** (`POST /api/camera-availability`): a real player error
  code triggers a server-side re-probe through the same policy. Timeouts are
  handled client-side only.

`npx tsx scripts/find-replacements.ts` dry-runs the repair logic against the
live database from a workstation without writing anything.

## What the site does for a viewer

- **Home** (`/`): the best camera right now. The eyebrow line says what is
  happening ("Sunset in 12 min", "Blue hour") and, when the camera on screen
  is in plain daylight, where the light is instead. TV mode (`T`) moves to the
  next golden hour every few minutes; `→` next, `F` fullscreen, `S` save.
- **Explore** (`/explore`): every live camera on a dark map, coloured by its
  light right now; saved cameras; golden hour now; tonight's sunsets in order.
- **Gallery** (`/gallery`): a frame from each camera's best golden hour, kept
  by `/api/tick` in R2 (`HIGHLIGHTS` bucket) — one per camera per day.
- **Reminders**: the 🔔 subscribes this browser (Web Push, VAPID keys in
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / secret `VAPID_PRIVATE_KEY`) to "Sunset in
  15 min" for that camera; `/api/tick` sends them.
- **Share**: a `?camera=` link carries the camera's name, description and
  stream cover as its card.
- **Analytics**: Cloudflare Web Analytics, once `NEXT_PUBLIC_CF_BEACON_TOKEN`
  is set in `wrangler.jsonc` vars.

## How new cameras arrive

[`lib/discovery.ts`](lib/discovery.ts), weekly:

1. **Gather** every live stream on the channels we already trust (the
   `host_link`s of cameras on air — ~80 channels, ~600 streams) plus a
   rotating slice of YouTube searches.
2. **Analyse** each stream we have not seen: probe it (playable, embeddable,
   not VR/360), then read the title with the rule engine in
   [`lib/place-rules.ts`](lib/place-rules.ts): split it into place phrases,
   geocode them with Open-Meteo ([`lib/geocode.ts`](lib/geocode.ts)), and
   earn confidence only from agreement — an exact town hit, a second phrase
   naming its state/country, the host channel's usual country. The type,
   tags and viewing profile come from title keywords and the geocoder's
   feature code. No model is needed; if `ANTHROPIC_API_KEY` is set, Claude
   ([`lib/llm.ts`](lib/llm.ts)) is consulted only for titles the rules could
   not resolve.
3. **Decide**: a stream that matches a camera we already have within 2 km
   either repairs it (if that camera is down) or is dropped as a duplicate.
   Otherwise confidence ≥ 0.8 from a trusted channel (≥ 0.9 from search)
   becomes a `camera_ytb` row on the spot; anything else waits in
   `camera_candidates` for a click at **`/admin/candidates`** (sign in with
   `CRON_SECRET`).
4. **Retire** cameras that have been down for 30 days so the hourly repair
   sweep stops retrying them; a successful probe un-retires.

Manual run: `curl -H "Authorization: Bearer $CRON_SECRET" "https://sunset-earth.com/api/discover?dry=1"`
(`limit=N`, `nosearch=1` also accepted).

## Layout

```
app/                Next.js app router
  page.tsx          Homepage: best camera, headline, TV mode
  explore/          Map of every live camera + tonight's lineup
  gallery/          Kept golden-hour frames
  api/              Cron routes, viewer endpoints, /api/admin/* (cookie or bearer), /api/dev/* (prod: 404)
  admin/candidates  Review queue for discovered streams
components/         camera-viewer, mini-map, explore-map, site-header, use-now, use-favourites, use-push
lib/
  db.ts             D1 access (env.DB)
  cameras.ts        camera_ytb rows → CameraRecord
  rankings.ts       camera_rankings reads
  client-ranking-v2 Scoring algorithm used by compute-rankings
  weather*.ts       Open-Meteo cache + classification
  availability.ts   YouTube probe
  youtube.ts        Channel/search crawlers, place matching
  cameraRefresh.ts  Replacement pipeline
  linkHealth.ts     Demotion/restoration policy
  discovery.ts      Weekly new-camera pipeline + retirement
  place-rules.ts    Model-free title → place resolution (geocoder as verifier)
  llm.ts            Optional Claude title analysis for unresolved titles
  geocode.ts        Open-Meteo geocoding
  sun-format.ts     Pure formatters for sun phases and clocks
  sun-schedule.ts   Golden hour now / upcoming sunsets from the live list
  push.ts           Web Push (VAPID) sending and subscription storage
  wikipedia.ts      Place descriptions
  auth.ts           CRON_SECRET guard, dev-tools gate
d1/                 schema.sql, migrations/, seed, CSV → SQL generator
worker.ts           Cloudflare entry: OpenNext fetch + scheduled()
scripts/            Maintenance tools (archive/ = historical, not compiled)
docs/               Design notes; archive/ holds pre-migration reports
```

## Data

`camera_ytb` is the only irreplaceable table — the curated camera list. The
others (`camera_rankings`, `camera_weather_cache`, `task_locks`) are rebuilt
by the crons. See [`d1/README.md`](d1/README.md).
