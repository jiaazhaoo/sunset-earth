-- Migration: Add camera_metadata field to camera_ytb table
-- Created: 2025-12-18
-- Description: Adds JSONB field to store enhanced camera metadata for improved ranking algorithm

-- Step 1: Add the camera_metadata column
ALTER TABLE camera_ytb
ADD COLUMN IF NOT EXISTS camera_metadata JSONB;

-- Step 2: Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_camera_metadata_primary_type
ON camera_ytb ((camera_metadata->>'primaryType'));

CREATE INDEX IF NOT EXISTS idx_camera_metadata_farpoint
ON camera_ytb ((camera_metadata->>'isFarpoint'))
WHERE camera_metadata->>'isFarpoint' = 'true';

CREATE INDEX IF NOT EXISTS idx_camera_metadata_tier
ON camera_ytb ((camera_metadata->>'tier'));

-- Step 3: Create a GIN index for full JSONB queries (optional, for advanced queries)
CREATE INDEX IF NOT EXISTS idx_camera_metadata_gin
ON camera_ytb USING GIN (camera_metadata);

-- Step 4: Add comment to document the field
COMMENT ON COLUMN camera_ytb.camera_metadata IS 'Enhanced camera metadata for ranking algorithm (primaryType, isFarpoint, tier, resolution, viewingTime, weatherTolerance)';
