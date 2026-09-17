# D1 database

Everything the app stores now lives in a single Cloudflare D1 (SQLite) database.
There is no Supabase and no Postgres anywhere in the stack.

## Tables

| Table | Contents | Rebuildable? |
| --- | --- | --- |
| `camera_ytb` | Master camera list (links, coordinates, timezone, tags) | ❌ **The only irreplaceable data** |
| `camera_rankings` | Scores written by `/api/compute-rankings` | ✅ cron rebuilds it |
| `camera_weather_cache` | Latest Open-Meteo snapshot per camera | ✅ cron refills it |
| `task_locks` | Short-lived cron locks | ✅ self-healing |

## First-time setup

```bash
# 1. Create the database
npx wrangler d1 create sunset-earth

# 2. Paste the returned database_id into wrangler.jsonc (d1_databases[0].database_id)

# 3. Regenerate the binding types
npm run cf-typegen

# 4. Create the tables (remote = the real database used by the deployed Worker)
npx wrangler d1 execute sunset-earth --remote --file=d1/schema.sql
```

## Importing the camera data

`camera_ytb` is the one table that must be carried over. The 156 cameras
exported from the old Supabase project are already committed as
[`seed-cameras.sql`](seed-cameras.sql):

```bash
npx wrangler d1 execute sunset-earth --remote --file=d1/seed-cameras.sql
```

`camera_rankings` and `camera_weather_cache` are deliberately **not** seeded —
the exported rows are months old and would fail the freshness filters anyway.
The cron jobs rebuild both.

### ⚠️ Every imported camera starts as unavailable

In the export, all 156 rows have `link_available = false`, with the last
availability check dated 2026-03-11. Straight after importing, the site has
nothing to show. Re-validate the links before expecting the homepage to work:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-worker>/api/refresh-links
```

`refresh-links` re-checks every stream and restores `link_available` for the
ones still live; `replace-link` then tries to repair the rest by crawling each
camera's `host_link` channel for a current stream. Expect some cameras to stay
dead — YouTube live streams do not survive months of neglect.

### Re-generating the seed from a fresh export

```bash
node d1/csv-to-sql.mjs camera_ytb path/to/camera_ytb_rows.csv > d1/seed-cameras.sql
```

The converter also handles `camera_rankings` and `camera_weather_cache`. It
normalizes Postgres values that SQLite has no type for: `true`/`false` → `1`/`0`,
and `2026-03-11 07:11:58.946+00` → `2026-03-11T07:11:58.946Z`. That timestamp
rewrite matters — the app compares dates as strings, and a space sorts before
`T`, so mixing the two formats would silently break every freshness filter.

## Verifying

```bash
npx wrangler d1 execute sunset-earth --remote \
  --command "SELECT COUNT(*) AS cameras, SUM(link_available) AS available FROM camera_ytb"
```

A fresh import reports `cameras = 156, available = 0`; see the warning above.

Then run the pipeline in order and check it populated rankings:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-worker>/api/refresh-links
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-worker>/api/weather-cache
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-worker>/api/compute-rankings
curl https://<your-worker>/api/rankings-health
```

## Local development

`wrangler` keeps a separate local database. Apply the schema without `--remote`
to work offline:

```bash
npx wrangler d1 execute sunset-earth --local --file=d1/schema.sql
```

## Ad-hoc queries

There is no longer a Node script that connects to the database directly — the D1
binding only exists inside the Worker. Use wrangler instead:

```bash
npx wrangler d1 execute sunset-earth --remote --command "SELECT camera_id, placename FROM camera_ytb LIMIT 10"
```
