-- Add pool_id column to camera_rankings for faster pool queries
-- This is an optional optimization (Phase 2)

ALTER TABLE camera_rankings
ADD COLUMN IF NOT EXISTS pool_id INTEGER;

-- Add index for fast pool-based queries
CREATE INDEX IF NOT EXISTS idx_camera_rankings_pool
ON camera_rankings(pool_id, score DESC, available)
WHERE available = true;

-- Add comment
COMMENT ON COLUMN camera_rankings.pool_id IS 'Pool assignment (1-5) based on camera evaluation';
