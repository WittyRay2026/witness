create table if not exists library_entries (
  user_id text not null,
  video_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, video_id)
);
