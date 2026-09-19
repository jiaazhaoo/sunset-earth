-- Picture-quality ranking. Apply each statement with --command.
ALTER TABLE camera_rankings ADD COLUMN sky_index REAL;      -- lib/sky.ts, 0..1
ALTER TABLE camera_rankings ADD COLUMN sky_title TEXT;      -- "High cloud", "Clear", …
ALTER TABLE camera_rankings ADD COLUMN visual_score REAL;   -- lib/visual.ts, 0..1, null when unknown

-- Latest look at each camera's live thumbnail (/api/tick). `live` is 1 once
-- the thumbnail has been seen to change, i.e. it is a real frame and not a
-- channel's uploaded card; only then is `score` trusted.
CREATE TABLE IF NOT EXISTS camera_visual (
  camera_id     TEXT PRIMARY KEY,
  video_id      TEXT,
  content_hash  TEXT,
  changed_at    TEXT,
  checks        INTEGER NOT NULL DEFAULT 0,
  changes       INTEGER NOT NULL DEFAULT 0,
  live          INTEGER NOT NULL DEFAULT 0,
  score         REAL,
  brightness    REAL,
  contrast      REAL,
  colorfulness  REAL,
  warm          REAL,
  sky           REAL,
  notes         TEXT,
  measured_at   TEXT
);
