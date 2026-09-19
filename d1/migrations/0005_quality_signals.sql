-- Picture-quality signals, round two. Apply each statement with --command.
ALTER TABLE camera_ytb ADD COLUMN max_height INTEGER;     -- tallest format the probe saw (lib/availability.ts), NULL = unknown
ALTER TABLE camera_ytb ADD COLUMN curated_rating INTEGER; -- 1..5 from /admin/curate, NULL = unrated

-- What viewers did with each camera, per phase of day (/api/events → lib/quality.ts).
CREATE TABLE IF NOT EXISTS camera_feedback (
  camera_id  TEXT NOT NULL,
  phase      TEXT NOT NULL,              -- golden | day | night
  skips      INTEGER NOT NULL DEFAULT 0, -- left within 5 s
  dwells     INTEGER NOT NULL DEFAULT 0, -- stayed 3 min or more
  favs       INTEGER NOT NULL DEFAULT 0, -- saved (minus unsaved)
  updated_at TEXT,
  PRIMARY KEY (camera_id, phase)
);
