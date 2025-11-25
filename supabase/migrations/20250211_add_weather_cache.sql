create table if not exists public.camera_weather_cache (
  camera_id text primary key,
  lat double precision not null,
  lng double precision not null,
  data jsonb not null,
  fetched_at timestamptz not null default now()
);

create index if not exists camera_weather_cache_fetched_at_idx
  on public.camera_weather_cache (fetched_at);
