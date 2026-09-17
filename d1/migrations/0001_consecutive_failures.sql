-- Soft probe failures (timeouts, bot-check pages) need two strikes in a row
-- before a camera is demoted; definitive ones (UNPLAYABLE, embed disabled)
-- still demote at once. Tracked per camera, reset on any successful probe.
--
-- Apply with:
--   npx wrangler d1 execute sunset-earth --remote --file=d1/migrations/0001_consecutive_failures.sql
ALTER TABLE camera_ytb ADD COLUMN consecutive_failures INTEGER NOT NULL DEFAULT 0;
