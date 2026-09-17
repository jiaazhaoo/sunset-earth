-- Cloudflare D1 (SQLite) schema for Sunset Earth.
--
-- Apply with:
--   npx wrangler d1 execute sunset-earth --remote --file=d1/schema.sql
--
-- Notes on the Postgres -> SQLite translation:
--   * jsonb        -> TEXT holding a JSON document (JSON.stringify/parse in app)
--   * timestamptz  -> TEXT holding an ISO-8601 UTC string ("2026-01-01T00:00:00.000Z").
--                     Always store UTC: the app compares these lexicographically,
--                     which only equals chronological order for uniform UTC ISO.
--   * BIGSERIAL    -> INTEGER PRIMARY KEY AUTOINCREMENT
--   * boolean      -> INTEGER 0/1

-- ---------------------------------------------------------------------------
-- camera_ytb : master camera list.
-- This table had no migration under supabase/migrations; the definition below
-- is reconstructed from lib/cameras.ts (CAMERA_COLUMNS + CameraRow) and the
-- INSERT statements in scripts/insert_cameras.sql.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS camera_ytb (
  camera_id        TEXT PRIMARY KEY,
  link             TEXT,
  placename        TEXT,
  city             TEXT,
  country          TEXT,
  latitude         REAL,
  longitude        REAL,
  timezone         TEXT,
  info_0           TEXT,
  tag              TEXT,              -- comma-separated, e.g. "City Skyline,Urban"
  host_link        TEXT,              -- channel /streams URL used to find replacements
  ytb_title        TEXT,
  link_available   INTEGER DEFAULT 1, -- 0/1
  sunset_delay     REAL DEFAULT 0,    -- minutes to extend the post-sunset window
  sunrise_advance  REAL DEFAULT 0,    -- minutes to extend the pre-sunrise window
  last_check       TEXT,              -- ISO-8601 UTC
  camera_metadata  TEXT               -- JSON document
);

CREATE INDEX IF NOT EXISTS idx_camera_ytb_available
  ON camera_ytb(link_available);

-- ---------------------------------------------------------------------------
-- camera_rankings : pre-computed scores written by /api/compute-rankings.
-- Safe to truncate; the cron rebuilds it.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS camera_rankings (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  camera_id             TEXT NOT NULL UNIQUE,
  score                 INTEGER NOT NULL,
  label                 TEXT,
  distance_minutes      REAL,
  is_clear              INTEGER DEFAULT 0,
  weather_class         TEXT,
  timezone              TEXT,
  sunrise               TEXT,
  sunset                TEXT,
  next_event_type       TEXT,
  next_event_time       TEXT,
  following_event_type  TEXT,
  following_event_time  TEXT,
  available             INTEGER DEFAULT 1,
  computed_at           TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_camera_rankings_available_score
  ON camera_rankings(available, score DESC);
CREATE INDEX IF NOT EXISTS idx_camera_rankings_computed_at
  ON camera_rankings(computed_at);

-- ---------------------------------------------------------------------------
-- camera_weather_cache : latest Open-Meteo snapshot per camera.
-- Pure cache — safe to truncate; /api/weather-cache refills it.
-- (The former camera_weather_history / camera_sun_cache / camera_sun_history
--  tables were write-only and have been dropped.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS camera_weather_cache (
  camera_id   TEXT PRIMARY KEY,
  lat         REAL NOT NULL,
  lng         REAL NOT NULL,
  data        TEXT NOT NULL,  -- JSON: OpenMeteoResponse
  fetched_at  TEXT NOT NULL   -- ISO-8601 UTC
);

CREATE INDEX IF NOT EXISTS idx_camera_weather_cache_fetched_at
  ON camera_weather_cache(fetched_at);

-- ---------------------------------------------------------------------------
-- task_locks : prevents overlapping cron work (e.g. compute-rankings starting
-- while weather-cache is mid-refresh). Locks auto-expire via expires_at.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS task_locks (
  task_name   TEXT PRIMARY KEY,
  locked_at   TEXT NOT NULL,
  locked_by   TEXT,
  -- Random per-acquisition token. The acquirer reads this back to confirm it
  -- actually won the lock, and only releases a lock still carrying its token.
  lock_token  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_locks_expires_at
  ON task_locks(expires_at);
