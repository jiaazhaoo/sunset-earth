-- Discovery pipeline (lib/discovery.ts) and camera retirement.
--
-- D1's file import rejects some statements; apply each with --command:
--   npx wrangler d1 execute sunset-earth --remote --command "<statement>"

-- Streams found by the weekly /api/discover run, waiting to become cameras.
CREATE TABLE IF NOT EXISTS camera_candidates (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id        TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  channel_url     TEXT,
  source          TEXT NOT NULL,                  -- 'channel' | 'search'
  discovered_at   TEXT NOT NULL,                  -- ISO-8601 UTC
  status          TEXT NOT NULL DEFAULT 'pending',-- pending | approved | rejected
  decided_by      TEXT,                           -- 'auto' | 'admin'
  reject_reason   TEXT,
  placename       TEXT,
  city            TEXT,
  country         TEXT,
  latitude        REAL,
  longitude       REAL,
  timezone        TEXT,
  tag             TEXT,                           -- comma-separated, as camera_ytb.tag
  camera_metadata TEXT,                           -- JSON, as camera_ytb.camera_metadata
  confidence      REAL,                           -- 0..1 from the analysis
  analysis        TEXT,                           -- JSON: model output + geocode
  camera_id       TEXT,                           -- camera_ytb row created on approval
  decided_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_camera_candidates_status ON camera_candidates(status);

-- When a camera went down (cleared on restore) and when it was retired from
-- the hourly repair queue after staying down too long.
ALTER TABLE camera_ytb ADD COLUMN unavailable_since TEXT;
ALTER TABLE camera_ytb ADD COLUMN retired_at TEXT;
UPDATE camera_ytb SET unavailable_since = COALESCE(last_check, '2026-09-17T00:00:00.000Z')
  WHERE link_available = 0 AND unavailable_since IS NULL;
