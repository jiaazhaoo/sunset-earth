alter table if exists camera_rankings
  add column if not exists following_event_type text,
  add column if not exists following_event_time timestamptz;
