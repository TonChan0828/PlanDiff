-- P5-1: 定期予定(繰り返し予定)。仕様書: docs/specs/P5-1_定期予定.md
-- recurring_rules(繰り返し定義)+ recurring_exceptions(この回のみ削除のtombstone)。
-- 実体化(recurring_rules → synced_events への展開)はアプリコード側(lib/calendar/recurring.ts)で行う。

create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  pattern text not null
    constraint recurring_rules_pattern_check check (pattern in ('daily', 'weekly', 'weekdays')),
  -- weekly のときのみ使用。0=日曜〜6=土曜(JSのDate#getDayと一致させる)
  weekdays smallint[]
    constraint recurring_rules_weekdays_range check (
      weekdays is null or (weekdays <@ array[0,1,2,3,4,5,6]::smallint[])
    ),
  constraint recurring_rules_weekdays_required check (
    pattern <> 'weekly'
    or (weekdays is not null and array_length(weekdays, 1) between 1 and 7)
  ),
  -- 「毎朝9時」はローカル時刻の概念のため、ルールはローカル時刻+IANAタイムゾーンで持ち、
  -- 実体化の瞬間にUTC(timestamptz)へ変換する(synced_events側はUTC保存のまま)
  start_time time not null,
  end_time time not null,
  constraint recurring_rules_time_check check (start_time < end_time),
  timezone text not null,
  starts_on date not null,
  ends_on date,
  constraint recurring_rules_ends_check check (ends_on is null or ends_on >= starts_on),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recurring_rules_user_idx on public.recurring_rules (user_id);

alter table public.recurring_rules enable row level security;

create policy "recurring_rules_select_own" on public.recurring_rules
  for select using (user_id = (select auth.uid()));
create policy "recurring_rules_insert_own" on public.recurring_rules
  for insert with check (user_id = (select auth.uid()));
create policy "recurring_rules_update_own" on public.recurring_rules
  for update using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "recurring_rules_delete_own" on public.recurring_rules
  for delete using (user_id = (select auth.uid()));

create trigger set_recurring_rules_updated_at
  before update on public.recurring_rules
  for each row execute function private.set_updated_at();

create table public.recurring_exceptions (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.recurring_rules (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  occurrence_date date not null,
  created_at timestamptz not null default now(),
  constraint recurring_exceptions_unique unique (rule_id, occurrence_date)
);

create index recurring_exceptions_user_idx on public.recurring_exceptions (user_id);

alter table public.recurring_exceptions enable row level security;

create policy "recurring_exceptions_select_own" on public.recurring_exceptions
  for select using (user_id = (select auth.uid()));
create policy "recurring_exceptions_insert_own" on public.recurring_exceptions
  for insert with check (user_id = (select auth.uid()));
create policy "recurring_exceptions_update_own" on public.recurring_exceptions
  for update using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "recurring_exceptions_delete_own" on public.recurring_exceptions
  for delete using (user_id = (select auth.uid()));

-- Data API への公開(明示GRANT。auto_expose無効のため)
grant select, insert, update, delete on public.recurring_rules to authenticated;
grant select, insert, update, delete on public.recurring_exceptions to authenticated;

grant all on public.recurring_rules to service_role;
grant all on public.recurring_exceptions to service_role;
