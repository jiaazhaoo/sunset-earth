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

`camera_ytb` is the one table that must be carried over. Export it from the old
Supabase project, then load it here.

**If you have a CSV export** (columns must match `camera_ytb` in `d1/schema.sql`):

```bash
node d1/csv-to-sql.mjs path/to/camera_ytb.csv > d1/seed.sql
npx wrangler d1 execute sunset-earth --remote --file=d1/seed.sql
```

**If you have a Postgres `INSERT` dump**, it usually needs two tweaks before it
will run against SQLite:

- `true` / `false` → `1` / `0` (for `link_available`)
- `NOW()` → an ISO string, e.g. `'2026-01-01T00:00:00.000Z'`

**As a last resort**, `scripts/insert_cameras.sql` contains 41 cameras
(ids 132–172) and can be adapted as seed data.

## Verifying

```bash
npx wrangler d1 execute sunset-earth --remote \
  --command "SELECT COUNT(*) AS cameras, SUM(link_available) AS available FROM camera_ytb"
```

Then trigger the pipeline and check it populated rankings:

```bash
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
