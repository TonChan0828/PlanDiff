-- P6-5: テーブル権限の最小化
-- 仕様書: docs/specs/P6-5_anon権限の剥奪.md
--
-- CLAUDE.md が定める「RLS有効・ポリシーゼロ・GRANTなしの三重防御」を実態に一致させる。
--
-- 2026-08-07 の本番 db push の際、`supabase db diff --linked` により、本番では anon に
-- 全テーブル(google_tokens を含む)の DELETE/INSERT/SELECT/UPDATE が付与されていることが判明した。
-- さらにローカル・本番の両方で anon / authenticated に TRUNCATE が付いている(TRUNCATE は RLS 対象外)。
--
-- 現時点ではどの経路からも悪用できない(RLS がポリシーゼロで全拒否し、PostgREST は TRUNCATE を
-- 公開せず、anon にDBログインも無い)。それでも直すのは、防御が一段減っていることと、
-- 既定権限により新規テーブルにも自動で付いてしまうため。

-- 1) anon から public のテーブル権限をすべて剥奪する。
-- 未認証コンテキストで public のテーブルに触る経路は存在しない
-- (マーケティングページはDBに触れず、認証は auth スキーマ=GoTrue、
--  /api/pro-interest は service role、profiles の自動作成は SECURITY DEFINER 関数)
revoke all on all tables in schema public from anon;

-- 2) authenticated は一度すべて剥奪し、必要な権限だけを付け直す。
-- これで TRUNCATE / REFERENCES / TRIGGER と、
-- google_tokens・pro_interest_events への権限が消える
revoke all on all tables in schema public from authenticated;

-- profiles は作成=トリガ / 削除=auth.users の CASCADE が担うため INSERT/DELETE は与えない(P0-6)
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.synced_events to authenticated;
grant select, insert, update, delete on public.time_entries to authenticated;
grant select, insert, update, delete on public.recurring_rules to authenticated;
grant select, insert, update, delete on public.recurring_exceptions to authenticated;
-- google_tokens / pro_interest_events には一切付けない(service role 専用)

-- 3) 既定権限を止める。以後、新規テーブルに anon / authenticated の権限が自動付与されない。
-- service_role の既定権限は残す(サーバー処理が新規テーブルへ即座にアクセスできる必要があるため)。
--
-- 【重要】この変更以降、テーブルを追加したら authenticated への grant を
-- マイグレーションに明示的に書くこと(CLAUDE.md の DB/RLS 規約にも記載)。
alter default privileges for role postgres in schema public
  revoke all on tables from anon;
alter default privileges for role postgres in schema public
  revoke all on tables from authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon;
alter default privileges for role postgres in schema public
  revoke all on sequences from authenticated;
