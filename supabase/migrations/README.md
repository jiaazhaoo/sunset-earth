# Legacy Supabase migrations (historical)

These SQL files describe the **old Supabase/Postgres** schema. They are kept for
reference only — the project has migrated to **Cloudflare D1 (SQLite)**.

The live schema now lives in [`../../d1/schema.sql`](../../d1/schema.sql).

Notable differences in the D1 schema:

- `camera_ytb` is now defined in the repo (it never had a migration here).
- `camera_sun_cache`, `camera_weather_history` and `camera_sun_history` were
  dropped — they were written to but never read.
- `jsonb` columns became `TEXT` holding JSON; `timestamptz` became ISO-8601 UTC
  `TEXT`; `BIGSERIAL` became `INTEGER PRIMARY KEY AUTOINCREMENT`.
- The `get_avg_score()` stored function was replaced by a plain `AVG(score)`
  query in `app/api/rankings-health/route.ts`.
