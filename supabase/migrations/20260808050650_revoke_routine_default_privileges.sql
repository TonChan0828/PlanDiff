-- P6-5(追補): 関数(ROUTINES)の既定権限も止める
-- 仕様書: docs/specs/P6-5_anon権限の剥奪.md 5-D
--
-- P6-5 本体では TABLES と SEQUENCES の既定権限だけを止めていた。
-- 本番適用後の `supabase db diff --linked` による検証で、ROUTINES の既定権限が
-- 残っていることが判明したため塞ぐ。
--
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO anon;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO authenticated;
--
-- 現時点で実害はない。自前の関数はすべて private スキーマにあり、
-- anon/authenticated に USAGE を与えていないため到達できない。
-- ただし今後 public に関数を作ると EXECUTE が自動付与されてしまうため、
-- 「新規オブジェクトに自動で権限が付かないようにする」という P6-5 の趣旨に合わせて止める。

alter default privileges for role postgres in schema public
  revoke all on routines from anon;
alter default privileges for role postgres in schema public
  revoke all on routines from authenticated;

-- 既存の public の関数(btree_gist 拡張が作る gbtreekey* など)は拡張所有のため触らない。
-- service_role の既定権限も従来どおり残す。
--
-- 【重要】この変更以降、public に関数(RPC等)を追加して authenticated から呼ぶ場合は、
-- grant execute をマイグレーションに明示すること(CLAUDE.md の DB/RLS 規約にも記載)。
