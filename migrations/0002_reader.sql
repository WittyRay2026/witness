create table if not exists videos (
  id text primary key,
  user_id text not null,
  platform text not null,
  platform_id text not null,
  url text not null,
  canonical_url text,
  title text,
  creator_name text,
  duration_sec integer,
  level text not null,
  status text not null default 'queued',
  evidence jsonb not null default '{}'::jsonb,
  metadata jsonb,
  representation jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists videos_platform_id_idx on videos (platform, platform_id);
create index if not exists videos_user_id_idx on videos (user_id);

create table if not exists jobs (
  id text primary key,
  video_id text not null,
  user_id text not null,
  level text not null,
  status text not null default 'queued',
  stage text not null default 'queued',
  progress integer not null default 0,
  log jsonb not null default '[]'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists creator_dossiers (
  id text primary key,
  user_id text not null,
  platform text not null,
  creator_id text not null,
  creator_name text,
  url text,
  status text not null default 'queued',
  sample jsonb,
  dossier jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists creator_platform_id_idx on creator_dossiers (platform, creator_id);
