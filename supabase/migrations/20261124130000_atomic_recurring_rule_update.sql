-- G-108: 定期予定の更新(ルール本体 + 今日以降の生成済み予定 + 今日以降の例外)を1トランザクションで確定する。
-- 仕様書: docs/specs/G-108_定期予定編集のトランザクション化.md
-- start_timer / stop_timer と同じく、API用RPCなので public に置き、security invoker で既存RLSを維持する。
-- security definer にしないのは、他ユーザーの行を触れないことをRLSに任せ続けるため。

create function public.update_recurring_rule(
  p_rule_id uuid,
  p_title text,
  p_pattern text,
  p_weekdays smallint[],
  p_start_time time,
  p_end_time time,
  p_timezone text,
  p_starts_on date,
  p_ends_on date,
  -- 「今日」の境界はタイムゾーン計算を伴うため、アプリ側(todayBoundary)で求めて渡す。
  -- p_threshold: ルールのタイムゾーンでの今日0時(UTC)、p_today: 同じ今日の日付
  p_threshold timestamptz,
  p_today date
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  updated_count integer;
  event_prefix text := 'rec:' || p_rule_id::text || ':';
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  update public.recurring_rules
  set title = p_title,
      pattern = p_pattern,
      weekdays = p_weekdays,
      start_time = p_start_time,
      end_time = p_end_time,
      timezone = p_timezone,
      starts_on = p_starts_on,
      ends_on = p_ends_on,
      inactivity_since = pg_catalog.now(),
      pause_review_after = null
  where id = p_rule_id;
  get diagnostics updated_count = row_count;

  -- 存在しない・他人のルール(RLSで見えない)なら何も変更しない。
  if updated_count = 0 then
    return false;
  end if;

  -- like はワイルドカードを解釈するため、接頭辞は文字列の先頭一致で比べる。
  delete from public.synced_events
  where source = 'app'
    and pg_catalog.left(google_event_id, pg_catalog.length(event_prefix)) = event_prefix
    and start_at >= p_threshold;

  delete from public.recurring_exceptions
  where rule_id = p_rule_id
    and occurrence_date >= p_today;

  -- ここまでのどこかで失敗したら、上のルール更新も含めて全て取り消される。
  return true;
end;
$$;

revoke all on function public.update_recurring_rule(
  uuid, text, text, smallint[], time, time, text, date, date, timestamptz, date
) from public, anon, service_role;
grant execute on function public.update_recurring_rule(
  uuid, text, text, smallint[], time, time, text, date, date, timestamptz, date
) to authenticated;
