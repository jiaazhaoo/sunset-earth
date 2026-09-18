-- A two-sentence introduction to the camera's place, fetched from Wikipedia
-- on first view by /api/camera-blurb (lib/wikipedia.ts) and cached here.
-- Apply each statement with --command.
ALTER TABLE camera_ytb ADD COLUMN description TEXT;
ALTER TABLE camera_ytb ADD COLUMN description_source TEXT; -- Wikipedia article URL
