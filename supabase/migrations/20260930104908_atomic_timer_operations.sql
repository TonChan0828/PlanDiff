-- P16-data: 既存停止 + 新規開始を1トランザクションで確定する。
-- 仕様書: docs/specs/P16-data_集計と記録の整合性.md
-- API用RPCなのでpublicに置く。SECURITY INVOKERにより既存RLSを維持する。

create function public.start_timer(p_title text, p_google_event_id text default null)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  timer_user_id uuid := auth.uid();
  timer_now timestamptz;
begin
  if timer_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  -- 実行中行が0件でも同一ユーザーの操作を直列化する。終了時に自動解放される。
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('plandiff:timer:' || timer_user_id::text, 0)
  );
  -- now()はトランザクション開始時刻なので、ロック待ちの後では古くなりうる。
  timer_now := pg_catalog.clock_timestamp();

  update public.time_entries
  set end_at = timer_now
  where user_id = timer_user_id and end_at is null;

  -- ここで失敗したら上の停止もロールバックされる。例外を成功へ変換しない。
  insert into public.time_entries (user_id, title, google_event_id, start_at, end_at)
  values (timer_user_id, p_title, p_google_event_id, timer_now, null);
end;
$$;

create function public.stop_timer()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  timer_user_id uuid := auth.uid();
  timer_now timestamptz;
begin
  if timer_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('plandiff:timer:' || timer_user_id::text, 0)
  );
  timer_now := pg_catalog.clock_timestamp();
  update public.time_entries
  set end_at = timer_now
  where user_id = timer_user_id and end_at is null;
  -- 0件でも成功する(既存の冪等性を維持)。
end;
$$;

revoke all on function public.start_timer(text, text) from public, anon, service_role;
revoke all on function public.stop_timer() from public, anon, service_role;
grant execute on function public.start_timer(text, text) to authenticated;
grant execute on function public.stop_timer() to authenticated;
