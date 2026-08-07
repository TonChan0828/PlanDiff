-- P6-2: データ増に耐えるクエリとインデックス
-- 仕様書: docs/specs/P6-2_データ増に耐えるクエリとインデックス.md
--
-- 予定・実績の「期間との重なり」判定は現在 start_at < timeMax AND end_at > timeMin で行っており、
-- (user_id, start_at) インデックスは片側境界しか使えない。そのため1週間の表示のために
-- そのユーザーの全履歴を読む構造になっており、使うほど確実に劣化する
-- (ローカル実測: 3年ぶり約11,000行で Rows Removed by Filter: 10751)。
--
-- 範囲型の生成列に GiST インデックスを張り、重なり判定をインデックスで解決できるようにする。
-- 「最大継続時間を仮定して下限を足す」案は、長い予定が黙って結果から消えるため採らない。

-- 1) 範囲型 + GiST に必要な拡張(user_id との複合インデックスのため btree_gist が要る)
create extension if not exists btree_gist;

-- 2) synced_events: 重なり判定用の生成列と GiST インデックス
--
-- case の意図:
--  1. [x,x) は空範囲で、空範囲は何とも重ならない。CHECK は end_at >= start_at のため
--     ゼロ長の行は作りうる(タイマーの即時停止、Google側の予定)。case がないと
--     ゼロ長の予定・実績が一覧から黙って消える
--  2. end_at < start_at のときに null へ倒すのは、生成列の評価が CHECK 制約より先に走るため。
--     tstzrange() に不正な組み合わせを渡すと data_exception(22000)が上がり、
--     本来の check_violation(23514)を覆い隠してしまう。不正データの拒否は CHECK に任せる
alter table public.synced_events
  add column span tstzrange
  generated always as (
    case
      when start_at = end_at then tstzrange(start_at, end_at, '[]')
      when start_at < end_at then tstzrange(start_at, end_at, '[)')
      else null
    end
  ) stored;

create index synced_events_user_span_idx
  on public.synced_events using gist (user_id, span);

-- 3) time_entries: 同上。
-- end_at が NULL(実行中タイマー)のとき tstzrange(start_at, null) は上端非有界 [start,) になり、
-- 「まだ終わっていない」という意味と一致する。
alter table public.time_entries
  add column span tstzrange
  generated always as (
    case
      when end_at is null then tstzrange(start_at, null, '[)')
      when start_at = end_at then tstzrange(start_at, end_at, '[]')
      when start_at < end_at then tstzrange(start_at, end_at, '[)')
      else null
    end
  ) stored;

create index time_entries_user_span_idx
  on public.time_entries using gist (user_id, span);

-- 4) 補助インデックス
--
-- .eq("source", ...) を使う sync route / recurring.ts 用。source はどのインデックスにも入っていなかった
create index synced_events_user_source_start_idx
  on public.synced_events (user_id, source, start_at);

-- rec:<ruleId>:% の前方一致 LIKE(lib/calendar/recurring.ts)。
-- (user_id, google_event_id) の UNIQUE は既定コレーションのため前方一致に使えない
create index synced_events_gei_pattern_idx
  on public.synced_events (user_id, google_event_id text_pattern_ops);

-- 書き込み専用で無制限に増え、CTR集計は必ず seq scan になる
create index pro_interest_events_type_created_idx
  on public.pro_interest_events (event_type, created_at desc);

-- 5) RLSポリシーへの TO authenticated 付与
--
-- 既存ポリシーは to 句を省略しており、暗黙で PUBLIC(anon を含む)に適用される。
-- ロールを明示すると未認証リクエストでポリシー評価自体がスキップされる。
-- anon には GRANT していないため、アクセス可否の挙動は変わらない。
-- using / with check の条件は既存とまったく同じものを再定義する。

-- profiles
drop policy "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
drop policy "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- synced_events
drop policy "synced_events_select_own" on public.synced_events;
create policy "synced_events_select_own" on public.synced_events
  for select to authenticated using (user_id = (select auth.uid()));
drop policy "synced_events_insert_own" on public.synced_events;
create policy "synced_events_insert_own" on public.synced_events
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy "synced_events_update_own" on public.synced_events;
create policy "synced_events_update_own" on public.synced_events
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
drop policy "synced_events_delete_own" on public.synced_events;
create policy "synced_events_delete_own" on public.synced_events
  for delete to authenticated using (user_id = (select auth.uid()));

-- time_entries
drop policy "time_entries_select_own" on public.time_entries;
create policy "time_entries_select_own" on public.time_entries
  for select to authenticated using (user_id = (select auth.uid()));
drop policy "time_entries_insert_own" on public.time_entries;
create policy "time_entries_insert_own" on public.time_entries
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy "time_entries_update_own" on public.time_entries;
create policy "time_entries_update_own" on public.time_entries
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
drop policy "time_entries_delete_own" on public.time_entries;
create policy "time_entries_delete_own" on public.time_entries
  for delete to authenticated using (user_id = (select auth.uid()));

-- recurring_rules
drop policy "recurring_rules_select_own" on public.recurring_rules;
create policy "recurring_rules_select_own" on public.recurring_rules
  for select to authenticated using (user_id = (select auth.uid()));
drop policy "recurring_rules_insert_own" on public.recurring_rules;
create policy "recurring_rules_insert_own" on public.recurring_rules
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy "recurring_rules_update_own" on public.recurring_rules;
create policy "recurring_rules_update_own" on public.recurring_rules
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
drop policy "recurring_rules_delete_own" on public.recurring_rules;
create policy "recurring_rules_delete_own" on public.recurring_rules
  for delete to authenticated using (user_id = (select auth.uid()));

-- recurring_exceptions
drop policy "recurring_exceptions_select_own" on public.recurring_exceptions;
create policy "recurring_exceptions_select_own" on public.recurring_exceptions
  for select to authenticated using (user_id = (select auth.uid()));
drop policy "recurring_exceptions_insert_own" on public.recurring_exceptions;
create policy "recurring_exceptions_insert_own" on public.recurring_exceptions
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy "recurring_exceptions_update_own" on public.recurring_exceptions;
create policy "recurring_exceptions_update_own" on public.recurring_exceptions
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
drop policy "recurring_exceptions_delete_own" on public.recurring_exceptions;
create policy "recurring_exceptions_delete_own" on public.recurring_exceptions
  for delete to authenticated using (user_id = (select auth.uid()));

-- google_tokens / pro_interest_events はポリシーを持たない(service role 専用)。
-- RLS有効・ポリシーゼロ・GRANTなしの三重防御を維持するため、ここでは何もしない。
