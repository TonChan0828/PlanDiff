-- P0-6: コア4テーブル(profiles / google_tokens / synced_events / time_entries)+ RLS
-- 仕様書: docs/specs/P0-6_DBスキーマとRLS.md

-- private スキーマとヘルパー
create schema if not exists private;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''));
  return new;
end;
$$;

-- 1) profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (id = (select auth.uid()));
create policy "profiles_update_own" on public.profiles
  for update using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- 2) google_tokens(RLS有効化のみ。ポリシーは一切作らない)
create table public.google_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_tokens enable row level security;

create trigger set_google_tokens_updated_at
  before update on public.google_tokens
  for each row execute function private.set_updated_at();

-- 3) synced_events
create table public.synced_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  google_event_id text not null,
  title text not null default '',
  start_at timestamptz not null,
  end_at timestamptz not null,
  synced_at timestamptz not null default now(),
  constraint synced_events_time_range check (end_at >= start_at),
  constraint synced_events_user_event_unique unique (user_id, google_event_id)
);

create index synced_events_user_start_idx
  on public.synced_events (user_id, start_at);

alter table public.synced_events enable row level security;

create policy "synced_events_select_own" on public.synced_events
  for select using (user_id = (select auth.uid()));
create policy "synced_events_insert_own" on public.synced_events
  for insert with check (user_id = (select auth.uid()));
create policy "synced_events_update_own" on public.synced_events
  for update using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "synced_events_delete_own" on public.synced_events
  for delete using (user_id = (select auth.uid()));

-- 4) time_entries
create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  google_event_id text,
  start_at timestamptz not null,
  end_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint time_entries_time_range check (end_at is null or end_at >= start_at)
);

create unique index one_running_timer_per_user
  on public.time_entries (user_id) where (end_at is null);
create index time_entries_user_start_idx
  on public.time_entries (user_id, start_at);

alter table public.time_entries enable row level security;

create policy "time_entries_select_own" on public.time_entries
  for select using (user_id = (select auth.uid()));
create policy "time_entries_insert_own" on public.time_entries
  for insert with check (user_id = (select auth.uid()));
create policy "time_entries_update_own" on public.time_entries
  for update using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "time_entries_delete_own" on public.time_entries
  for delete using (user_id = (select auth.uid()));

create trigger set_time_entries_updated_at
  before update on public.time_entries
  for each row execute function private.set_updated_at();

-- 5) Data API への公開(明示GRANT)
-- 新規テーブルはデフォルトでは Data API ロールに公開されないため(auto_expose無効)、
-- 意図するアクセス範囲だけを明示的にGRANTする。
-- google_tokens は anon / authenticated にGRANTしない(service role のみ)。
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.synced_events to authenticated;
grant select, insert, update, delete on public.time_entries to authenticated;

grant all on public.profiles to service_role;
grant all on public.google_tokens to service_role;
grant all on public.synced_events to service_role;
grant all on public.time_entries to service_role;
