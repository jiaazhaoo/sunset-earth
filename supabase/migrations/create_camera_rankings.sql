-- Create camera rankings table for pre-computed scores
CREATE TABLE IF NOT EXISTS camera_rankings (
  id BIGSERIAL PRIMARY KEY,
  camera_id TEXT NOT NULL,
  score INTEGER NOT NULL,
  label TEXT,
  distance_minutes DOUBLE PRECISION,
  is_clear BOOLEAN DEFAULT false,
  weather_class TEXT,
  timezone TEXT,
  sunrise TIMESTAMPTZ,
  sunset TIMESTAMPTZ,
  next_event_type TEXT,
  next_event_time TIMESTAMPTZ,
  following_event_type TEXT,
  following_event_time TIMESTAMPTZ,
  available BOOLEAN DEFAULT true,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT camera_rankings_camera_id_unique UNIQUE (camera_id)
);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_camera_rankings_score ON camera_rankings(score DESC);
CREATE INDEX IF NOT EXISTS idx_camera_rankings_available ON camera_rankings(available);
CREATE INDEX IF NOT EXISTS idx_camera_rankings_computed_at ON camera_rankings(computed_at);

-- Composite index for the most common query pattern
CREATE INDEX IF NOT EXISTS idx_camera_rankings_available_score
  ON camera_rankings(available, score DESC)
  WHERE available = true;

COMMENT ON TABLE camera_rankings IS 'Pre-computed camera scores for fast lookup';
COMMENT ON COLUMN camera_rankings.score IS 'Computed score (0-100) based on weather and time';
COMMENT ON COLUMN camera_rankings.label IS 'Time window label (sunset-primary, sunrise-primary, etc)';
COMMENT ON COLUMN camera_rankings.computed_at IS 'When this ranking was last computed';
