-- 新規endpointは1アカウント最大10件。既存subscriptionは削除せず、
-- 上限超過済みアカウントは10件未満になるまで新規登録を拒否する。
-- service_role経由の同時登録も
-- user_id単位のtransaction advisory lockで直列化し、既存RLS/GRANTは変えない。
create or replace function private.enforce_push_subscription_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  subscription_count bigint;
begin
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id then
      raise exception 'push_endpoint_owned_by_another_user'
        using errcode = '23514';
    end if;
    -- 同一ユーザー・同一endpointの更新は上限時でも許可する。
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('push-subscription:' || new.user_id::text, 0)
  );

  -- INSERT ... ON CONFLICT reaches the BEFORE INSERT trigger first. An existing
  -- endpoint is updated below; the update trigger rejects cross-user ownership.
  if exists (
    select 1 from public.push_subscriptions where endpoint = new.endpoint
  ) then
    return new;
  end if;

  select pg_catalog.count(*)
    into subscription_count
    from public.push_subscriptions
   where user_id = new.user_id;

  if subscription_count >= 10 then
    raise exception 'push_subscription_limit_exceeded'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger enforce_push_subscription_limit
  before insert or update on public.push_subscriptions
  for each row execute function private.enforce_push_subscription_limit();
