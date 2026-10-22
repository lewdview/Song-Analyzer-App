-- Song Analyzer storage on the PIM project (toemkhrfsbkfkutwcjkd), applied
-- 2026-10-22. The make-server-473d7342 edge function keeps every analysis
-- in this key/value table and saved audio in the song-audio bucket.

create table if not exists public.kv_store_473d7342 (
  key text not null primary key,
  value jsonb not null
);

-- Row-level security with no policies: only the service role (the edge
-- function, which checks public.is_admin() before any write) can use it.
alter table public.kv_store_473d7342 enable row level security;

-- Saved audio is played back by public URL; uploads go through the function.
insert into storage.buckets (id, name, public)
values ('song-audio', 'song-audio', true)
on conflict (id) do nothing;
