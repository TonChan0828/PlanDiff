-- S-5: ownership, bounded anonymous analytics, direct-write validation.
create table private.quarantined_recurring_exceptions (
  id uuid primary key,
  rule_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  occurrence_date date not null,
  created_at timestamptz not null,
  quarantined_at timestamptz not null default now()
);
alter table private.quarantined_recurring_exceptions enable row level security;
revoke all on private.quarantined_recurring_exceptions from public, anon, authenticated;
grant all on private.quarantined_recurring_exceptions to service_role;
insert into private.quarantined_recurring_exceptions(id, rule_id, user_id, occurrence_date, created_at)
select e.id, e.rule_id, e.user_id, e.occurrence_date, e.created_at
from public.recurring_exceptions e join public.recurring_rules r on r.id=e.rule_id
where e.user_id<>r.user_id;
delete from public.recurring_exceptions e using private.quarantined_recurring_exceptions q where e.id=q.id;
alter table public.recurring_rules add constraint recurring_rules_id_owner_unique unique(id,user_id);
alter table public.recurring_exceptions add constraint recurring_exceptions_rule_owner_fk
  foreign key(rule_id,user_id) references public.recurring_rules(id,user_id) on delete cascade;
drop policy recurring_exceptions_insert_own on public.recurring_exceptions;
create policy recurring_exceptions_insert_own on public.recurring_exceptions for insert to authenticated
with check(user_id=(select auth.uid()) and exists(select 1 from public.recurring_rules r where r.id=rule_id and r.user_id=(select auth.uid())));
drop policy recurring_exceptions_update_own on public.recurring_exceptions;
create policy recurring_exceptions_update_own on public.recurring_exceptions for update to authenticated
using(user_id=(select auth.uid()))
with check(user_id=(select auth.uid()) and exists(select 1 from public.recurring_rules r where r.id=rule_id and r.user_id=(select auth.uid())));

-- No raw IPs, user IDs or cookies are stored in these counters.
create table private.pro_interest_limits (
  window_at timestamptz not null,
  source_key text not null check(source_key='global' or source_key ~ '^[a-f0-9]{64}$'),
  count integer not null check(count>=0),
  primary key(window_at,source_key)
);
alter table private.pro_interest_limits enable row level security;
revoke all on private.pro_interest_limits from public,anon,authenticated;
grant usage on schema private to service_role;
grant all on private.pro_interest_limits to service_role;

-- A service-role-only, invoker-rights RPC. Serialize a global bucket before
-- inserting any per-source bucket, bounding both accepted writes and bucket count.
create function public.record_pro_interest_limited(p_event_type text,p_source_key text)
returns table(allowed boolean,retry_after integer)
language plpgsql security invoker set search_path='' as $$
declare
  t timestamptz;
  w timestamptz;
  global_count integer;
  source_count integer;
begin
  if p_event_type is null or p_event_type not in ('view','click') or p_source_key is null or p_source_key !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid analytics input' using errcode='22023';
  end if;
  -- Do not accept writes when the scheduled purge has been unhealthy for 10 min.
  if exists(select 1 from private.pro_interest_limits where window_at < clock_timestamp()-interval '10 minutes') then
    raise exception 'Analytics cleanup overdue' using errcode='55000';
  end if;
  t := clock_timestamp(); w := date_trunc('minute',t);
  insert into private.pro_interest_limits values(w,'global',0) on conflict do nothing;
  select count into global_count from private.pro_interest_limits where window_at=w and source_key='global' for update;
  retry_after := greatest(1,ceil(extract(epoch from w+interval '1 minute'-clock_timestamp()))::integer);
  if global_count>=600 then allowed:=false; return next; return; end if;
  insert into private.pro_interest_limits values(w,p_source_key,0) on conflict do nothing;
  select count into source_count from private.pro_interest_limits where window_at=w and source_key=p_source_key for update;
  if source_count>=20 then allowed:=false; return next; return; end if;
  update private.pro_interest_limits set count=count+1 where window_at=w and source_key in ('global',p_source_key);
  insert into public.pro_interest_events(event_type) values(p_event_type);
  allowed:=true; retry_after:=0; return next;
end;
$$;
revoke all on function public.record_pro_interest_limited(text,text) from public,anon,authenticated;
grant execute on function public.record_pro_interest_limited(text,text) to service_role;

create function private.purge_pro_interest_limits() returns void
language sql security invoker set search_path='' as $$
  delete from private.pro_interest_limits where window_at < clock_timestamp()-interval '2 minutes';
$$;
revoke all on function private.purge_pro_interest_limits() from public,anon,authenticated;
grant execute on function private.purge_pro_interest_limits() to service_role;
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('plandiff-pro-interest-purge','* * * * *','select private.purge_pro_interest_limits()');

-- Preserve unchanged legacy titles and exact snapshots of the user's saved
-- events/entries. The trigger executes under RLS, never with owner privileges.
create function private.validate_entry_input() returns trigger
language plpgsql security invoker set search_path='' as $$
declare changed boolean;
begin
  changed := tg_op='INSERT';
  if tg_op='UPDATE' then changed:=new.title is distinct from old.title; end if;
  if new.google_event_id is not null and char_length(new.google_event_id)>2048 then
    raise exception 'Invalid event identifier' using errcode='23514';
  end if;
  if changed and char_length(new.title)>200
    and not exists(select 1 from public.synced_events e where e.user_id=new.user_id and e.google_event_id=new.google_event_id and e.title=new.title)
    and not exists(select 1 from public.time_entries e where e.user_id=new.user_id and e.title=new.title and e.google_event_id is not distinct from new.google_event_id)
  then raise exception 'Title too long' using errcode='23514'; end if;
  return new;
end;
$$;
revoke all on function private.validate_entry_input() from public,anon,authenticated;
create trigger validate_entry_input before insert or update on public.time_entries
for each row execute function private.validate_entry_input();

create function private.validate_plan_input() returns trigger
language plpgsql security invoker set search_path='' as $$
declare changed boolean;
begin
  changed:=tg_op='INSERT';
  if tg_op='UPDATE' then changed:=new.title is distinct from old.title; end if;
  if tg_table_name='synced_events' then
    if char_length(new.google_event_id)>2048 then raise exception 'Invalid event identifier' using errcode='23514'; end if;
    if new.source='google' then return new; end if;
    if new.google_event_id like 'rec:%' and exists(
      select 1 from public.recurring_rules r
      where r.id::text=split_part(new.google_event_id,':',2)
        and r.user_id=new.user_id and r.title=new.title
    ) then return new; end if;
  end if;
  if changed and (char_length(btrim(new.title))=0 or char_length(new.title)>200) then
    raise exception 'Invalid title' using errcode='23514';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_plan_input() from public,anon,authenticated;
create trigger validate_app_event_input before insert or update on public.synced_events
for each row execute function private.validate_plan_input();
create trigger validate_rule_input before insert or update on public.recurring_rules
for each row execute function private.validate_plan_input();

-- Only a service-owned health endpoint may inspect scheduler metadata. Return
-- health alone, never source keys, raw requests, or SQL command text.
create function private.analytics_security_health() returns boolean
language sql stable security definer set search_path='' as $$
  select not exists(select 1 from private.pro_interest_limits where window_at<now()-interval '10 minutes')
    and exists(select 1 from cron.job where jobname='plandiff-pro-interest-purge' and active)
    and coalesce((select d.status='succeeded' and d.end_time>=now()-interval '3 minutes'
      from cron.job_run_details d join cron.job j on d.jobid=j.jobid
      where j.jobname='plandiff-pro-interest-purge' and d.end_time is not null
      order by d.end_time desc limit 1),false);
$$;
revoke all on function private.analytics_security_health() from public,anon,authenticated;
grant execute on function private.analytics_security_health() to service_role;
create function public.analytics_security_health() returns boolean
language sql stable security invoker set search_path='' as $$
  select private.analytics_security_health();
$$;
revoke all on function public.analytics_security_health() from public,anon,authenticated;
grant execute on function public.analytics_security_health() to service_role;
