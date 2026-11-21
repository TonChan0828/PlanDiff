-- P10-3: 学習補正の対象拡大。仕様書: docs/specs/P10-3_学習補正の対象拡大と再計測の集約.md
-- 学習の有効・無効を作成経路(origin)から切り離し、専用の列で管理する。
-- 既存行はすべて有効にする(本番で「自動調整を止める」を使った行はない。2026-11-20調査)。
alter table public.recurring_rules
  add column auto_adjust_enabled boolean not null default true;

-- 既存テーブルへの列追加のため、RLSポリシー・GRANTは既存のものがそのまま適用される。
-- 対象判定以外(楽観ロック・7日間隔・休止中の除外)は 20261018131510 と同じ。
create or replace function public.apply_recurring_rule_learning(
  p_rule_id uuid, p_previous_start time, p_previous_end time,
  p_new_start time, p_new_end time, p_now timestamptz default now()
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare r public.recurring_rules%rowtype;
begin
  select * into r from public.recurring_rules
    where id = p_rule_id and user_id = (select auth.uid()) for update;
  if not found or not r.auto_adjust_enabled
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
