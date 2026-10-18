-- 既存予定は導入日から観察し、導入直後の一斉提案を避ける。
alter table public.recurring_rules
  add column inactivity_since timestamptz not null default now(),
  add column pause_review_after timestamptz;

create table public.recurring_rule_pauses (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.recurring_rules(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  starts_on date not null,
  -- 終了日は含まない。同日の休止・再開は空の期間として保存できる。
  ends_on date,
  constraint recurring_rule_pauses_dates check (ends_on is null or ends_on >= starts_on)
);
create index recurring_rule_pauses_rule_idx on public.recurring_rule_pauses(rule_id, starts_on);
create unique index recurring_rule_pauses_open_idx on public.recurring_rule_pauses(rule_id) where ends_on is null;
create index recurring_rule_pauses_user_idx on public.recurring_rule_pauses(user_id);
create index time_entries_user_event_start_idx on public.time_entries(user_id, google_event_id text_pattern_ops, start_at desc);

alter table public.recurring_rule_pauses enable row level security;
create policy recurring_rule_pauses_owner on public.recurring_rule_pauses
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.recurring_rules r where r.id = rule_id and r.user_id = (select auth.uid())
  ));
grant select, insert, update, delete on public.recurring_rule_pauses to authenticated;
grant all on public.recurring_rule_pauses to service_role;

-- 手動編集時は、新しい曜日・時間で改めて観察する。学習による時間変更は対象外。
-- 手動更新側が inactivity_since を明示してリセットする。
create function public.set_recurring_rule_pause(p_rule_id uuid, p_action text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  r public.recurring_rules%rowtype;
  tomorrow date;
  pause_id uuid;
begin
  if (select auth.uid()) is null or p_action not in ('pause', 'resume', 'snooze') then
    return false;
  end if;
  select * into r from public.recurring_rules
    where id = p_rule_id and user_id = (select auth.uid()) for update;
  if not found then return false; end if;
  if r.origin <> 'suggestion' and p_action <> 'resume' then return false; end if;
  tomorrow := (now() at time zone r.timezone)::date + 1;
  select id into pause_id from public.recurring_rule_pauses
    where rule_id = r.id and ends_on is null for update;

  if p_action = 'pause' then
    -- 休止要求の再送は同じ状態へ収束させる。
    if pause_id is not null then return true; end if;
    if r.ends_on is not null and r.ends_on < tomorrow then return false; end if;
    insert into public.recurring_rule_pauses(rule_id, user_id, starts_on)
      values (r.id, r.user_id, tomorrow);
    delete from public.synced_events
      where user_id = r.user_id and source = 'app'
        and google_event_id like 'rec:' || r.id::text || ':%'
        and start_at >= (tomorrow::timestamp at time zone r.timezone);
  elsif p_action = 'resume' then
    if pause_id is null then
      -- 二重操作は成功扱い。ただし終了済みのルールは再開しない。
      return r.ends_on is null or r.ends_on >= tomorrow;
    end if;
    if r.ends_on is not null and r.ends_on < tomorrow then return false; end if;
    update public.recurring_rule_pauses set ends_on = tomorrow where id = pause_id;
    update public.recurring_rules
      set inactivity_since = tomorrow::timestamp at time zone r.timezone,
          pause_review_after = null, last_learned_at = now()
      where id = r.id;
  else
    if pause_id is not null then return false; end if;
    update public.recurring_rules set pause_review_after = now() + interval '14 days' where id = r.id;
  end if;
  return true;
end;
$$;
revoke all on function public.set_recurring_rule_pause(uuid, text) from public, anon;
grant execute on function public.set_recurring_rule_pause(uuid, text) to authenticated;

-- 予定の生成と休止を同じルール行で直列化する。古い画面からの生成も休止期間を復活させない。
create function public.guard_paused_recurring_event()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_rule_id uuid;
  v_occurrence_date date;
begin
  if new.source <> 'app' or new.google_event_id !~ '^rec:[0-9a-f-]{36}:[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return new;
  end if;
  v_rule_id := split_part(new.google_event_id, ':', 2)::uuid;
  v_occurrence_date := split_part(new.google_event_id, ':', 3)::date;
  perform 1 from public.recurring_rules r where r.id = v_rule_id and r.user_id = new.user_id for update;
  if exists (select 1 from public.recurring_rule_pauses p
    where p.rule_id = v_rule_id and v_occurrence_date >= p.starts_on
      and (p.ends_on is null or v_occurrence_date < p.ends_on)) then
    return null;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_paused_recurring_event() from public, anon, authenticated;
create trigger guard_paused_recurring_event before insert or update on public.synced_events
  for each row execute function public.guard_paused_recurring_event();

-- 表示週や実体化済み行の有無によらず、現在時刻から休止候補を求める。
-- p_now は境界検証にも使用する。本人のデータのみを参照する。
create function public.get_recurring_pause_suggestions(p_now timestamptz default now())
returns table (rule_id uuid, title text, timezone text, missed_count bigint, last_recorded_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  with candidates as (
    select r.*, latest.start_at as last_recorded_at, latest.occurrence_date as last_occurrence_date,
      greatest(r.inactivity_since, coalesce(latest.start_at, r.inactivity_since)) as observation_start
    from public.recurring_rules r
    left join lateral (
      select max(e.start_at) as start_at, max(split_part(e.google_event_id, ':', 3)::date) as occurrence_date from public.time_entries e
      where e.user_id = r.user_id and e.google_event_id like 'rec:' || r.id::text || ':%'
        and e.end_at is not null and e.end_at <= p_now and e.start_at <= p_now
    ) latest on true
    where r.user_id = (select auth.uid()) and r.origin = 'suggestion'
      and (r.pause_review_after is null or r.pause_review_after <= p_now)
      and (r.ends_on is null or (r.ends_on + r.end_time) at time zone r.timezone > p_now)
      and not exists (select 1 from public.recurring_rule_pauses p where p.rule_id = r.id
        and (p.ends_on is null or p.ends_on > (p_now at time zone r.timezone)::date))
      -- 計測中の予定に対する休止提案は出さない。
      and not exists (select 1 from public.time_entries e where e.user_id = r.user_id
        and e.google_event_id like 'rec:' || r.id::text || ':%' and e.end_at is null)
  ), missed as (
    select c.*, scheduled.day::date as occurrence_date
    from candidates c
    cross join lateral generate_series(
      greatest(c.starts_on, (c.observation_start at time zone c.timezone)::date)::timestamp,
      (p_now at time zone c.timezone)::date::timestamp, interval '1 day'
    ) scheduled(day)
    where (c.ends_on is null or scheduled.day::date <= c.ends_on)
      and (c.pattern = 'daily'
        or (c.pattern = 'weekdays' and extract(isodow from scheduled.day) between 1 and 5)
        or (c.pattern = 'weekly' and extract(dow from scheduled.day)::smallint = any(c.weekdays)))
      and (scheduled.day::date + c.start_time) at time zone c.timezone >= c.inactivity_since
      and (scheduled.day::date + c.end_time) at time zone c.timezone <= p_now
      -- 遅れて記録した場合でも、その実績が紐づく回までは連続未記録に数えない。
      and (c.last_occurrence_date is null or scheduled.day::date > c.last_occurrence_date)
      and not exists (select 1 from public.recurring_exceptions e
        where e.rule_id = c.id and e.occurrence_date = scheduled.day::date)
      and not exists (select 1 from public.recurring_rule_pauses p
        where p.rule_id = c.id and scheduled.day::date >= p.starts_on
          and (p.ends_on is null or scheduled.day::date < p.ends_on))
  )
  select id, title, timezone, count(*), last_recorded_at from missed
  group by id, title, timezone, last_recorded_at, observation_start
  having count(*) >= 3 and p_now >= (
    case when last_recorded_at is not null then observation_start
      else greatest(observation_start, (min(occurrence_date) + min(start_time)) at time zone timezone)
    end
  ) + interval '14 days'
  order by id;
$$;
revoke all on function public.get_recurring_pause_suggestions(timestamptz) from public, anon;
grant execute on function public.get_recurring_pause_suggestions(timestamptz) to authenticated;

-- 学習結果の保存も1トランザクションにし、休止・同時学習との競合を防ぐ。
create function public.apply_recurring_rule_learning(
  p_rule_id uuid, p_previous_start time, p_previous_end time,
  p_new_start time, p_new_end time, p_now timestamptz default now()
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare r public.recurring_rules%rowtype;
begin
  select * into r from public.recurring_rules
    where id = p_rule_id and user_id = (select auth.uid()) for update;
  if not found or r.origin <> 'suggestion'
    or r.start_time <> p_previous_start or r.end_time <> p_previous_end
    or (r.last_learned_at is not null and r.last_learned_at > p_now - interval '7 days')
    or exists (select 1 from public.recurring_rule_pauses p where p.rule_id = r.id
      and (p.ends_on is null or p.ends_on > (p_now at time zone r.timezone)::date))
  then return false; end if;
  if p_new_start is null and p_new_end is null then
    update public.recurring_rules set last_learned_at = p_now where id = r.id;
    return true;
  end if;
  if p_new_start is null or p_new_end is null or p_new_end <= p_new_start then return false; end if;
  update public.recurring_rules
    set start_time = p_new_start, end_time = p_new_end, last_learned_at = p_now where id = r.id;
  -- 開始済みの予定は保持する。今日の実績と予定の対応も崩さない。
  delete from public.synced_events where user_id = r.user_id and source = 'app'
    and google_event_id like 'rec:' || r.id::text || ':%' and start_at >= p_now;
  return true;
end;
$$;
revoke all on function public.apply_recurring_rule_learning(uuid, time, time, time, time, timestamptz) from public, anon;
grant execute on function public.apply_recurring_rule_learning(uuid, time, time, time, time, timestamptz) to authenticated;
