# Sunset Earth

A Next.js application that intelligently displays live camera feeds showing beautiful sunrises and sunsets from around the world, powered by weather-based ranking.

## Features

- **Intelligent Camera Ranking**: Weather-based scoring system that ranks cameras by their sunset/sunrise quality
- **Automatic Link Refresh**: Smart YouTube link replacement with multi-tier similarity matching
- **Real-time Availability Checking**: Monitors camera feed health and automatically replaces unavailable streams
- **Scheduled Automation**: Cron-driven tasks for weather caching, ranking computation, and link maintenance

## Getting Started

### Prerequisites

- Node.js 18+
- Cloudflare account (Workers + D1)

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

### Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```
# Required in production — protects the cron/task API routes
CRON_SECRET=generate-a-long-random-string

# Public base URL of the deployment (used for internal route-to-route calls
# and by the Cloudflare scheduled() cron handler)
SITE_URL=https://your-app.workers.dev
```

The database is a Cloudflare D1 binding (`DB`) configured in `wrangler.jsonc`,
not a connection string — see [d1/README.md](d1/README.md).

> Note: on Cloudflare Workers, secrets are injected per-request — set them with
> `wrangler secret put <NAME>` (not in `wrangler.jsonc`, which is committed).

## Architecture

### Key Components

- **Camera Ranking System** ([lib/weather.ts](lib/weather.ts), [lib/client-ranking-v2.ts](lib/client-ranking-v2.ts)): Scores cameras based on weather conditions, time until sunset/sunrise, and visibility. `client-ranking-v2` is the production scorer used by `compute-rankings`.
- **Availability Detection** ([lib/availability.ts](lib/availability.ts)): YouTube playability checking with multiple detection methods.
- **Smart Link Refresh** ([lib/cameraRefresh.ts](lib/cameraRefresh.ts)): Three-tier similarity matching (exact, smart, relaxed) for finding replacement streams.
- **Distributed Task Locks** ([lib/task-lock.ts](lib/task-lock.ts)): Prevents concurrent cron executions across serverless instances.

### Cron Jobs (Cloudflare Cron Triggers)

Schedules live in [wrangler.jsonc](wrangler.jsonc) `triggers.crons`; the custom
[worker.ts](worker.ts) `scheduled()` handler dispatches each cron expression to
the matching API route:

| Schedule       | Route                    | Purpose                                   |
| -------------- | ------------------------ | ----------------------------------------- |
| `0 * * * *`    | `/api/replace-link`      | Hourly: revalidate & replace broken links |
| `0 */3 * * *`  | `/api/weather-cache`     | Every 3h: refresh weather/sun caches      |
| `*/5 * * * *`  | `/api/compute-rankings`  | Every 5 min: recompute scores             |

These routes are protected by `CRON_SECRET`; the scheduled handler sends it as a
Bearer token.

### Database Schema

Cloudflare D1 (SQLite). Four tables:
- `camera_ytb`: Camera metadata and YouTube links — the only irreplaceable data
- `camera_rankings`: Computed scores and availability status (cron rebuilds it)
- `camera_weather_cache`: Cached Open-Meteo snapshots (cron refills it)
- `task_locks`: Distributed lock mechanism for cron jobs

Schema and setup/import instructions: [d1/schema.sql](d1/schema.sql) and
[d1/README.md](d1/README.md).

## Project Structure

```
/app                    # Next.js app directory
  /api                  # API routes (compute-rankings, weather-cache, replace-link, ...)
/lib                    # Core libraries (weather, availability, cameraRefresh, task-lock, ...)
/components             # Client components (camera-viewer, realtime-sidebar, ...)
/d1                     # D1 schema, import tooling and DB docs
/scripts                # Utility & maintenance scripts
/docs                   # Architecture & development notes
worker.ts               # Cloudflare Worker entrypoint (fetch + scheduled/cron)
wrangler.jsonc          # Cloudflare Workers config (bindings, cron triggers)
open-next.config.ts     # OpenNext Cloudflare adapter config
```

## Deployment (Cloudflare Workers)

This project deploys to **Cloudflare Workers** via the
[OpenNext](https://opennext.js.org/cloudflare) adapter (`@opennextjs/cloudflare`).

### One-time setup

```bash
# Authenticate wrangler with your Cloudflare account
npx wrangler login

# Set secrets (do NOT put these in wrangler.jsonc)
npx wrangler secret put CRON_SECRET

# Create the D1 database and load the schema — see d1/README.md
npx wrangler d1 create sunset-earth
npx wrangler d1 execute sunset-earth --remote --file=d1/schema.sql
```

Set `SITE_URL` in `wrangler.jsonc` `vars` to your deployed URL (or a custom domain).

### Build & deploy

```bash
# Regenerate Cloudflare types after changing wrangler.jsonc
npm run cf-typegen

# Local preview in the workerd runtime
npm run preview

# Build + deploy to Cloudflare
npm run deploy
```

### Notes / constraints

- The heavy cron routes iterate every camera. `wrangler.jsonc` sets
  `limits.cpu_ms = 300000` (5 min) to match the old behavior — this requires a
  **paid Workers plan**. Cron Triggers also run on the paid plan.
- `compatibility_flags` includes `nodejs_compat` (required by OpenNext) and
  `global_fetch_strictly_public` (so internal route-to-route `fetch` calls work).
- `worker-configuration.d.ts` and `.open-next/` are generated and gitignored;
  run `npm run cf-typegen` after cloning.

## Documentation

- [Project Orientation](PROJECT_ORIENTATION.md) — deep architecture & data model
- [Architecture Overview](docs/architecture/ARCHITECTURE_REFACTOR.md)
- [Ranking Algorithm](docs/development/RANKING_ALGORITHM.md)
- [Project Health Review](PROJECT_HEALTH_REVIEW.md) — restart assessment

## License

Private project
