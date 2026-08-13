-- P10-1: 提案経由の定期予定の自動学習補正。仕様書: docs/specs/P10-1_提案経由予定の学習補正.md
-- 「毎週にする」で受け入れた定期予定を区別する origin と、
-- 学習の再計算を間引くための last_learned_at を recurring_rules に追加する。
-- 既存テーブルへの列追加のみのため、RLSポリシー・GRANTの変更は不要
-- (既存ポリシーが行全体をカバーする)。

alter table public.recurring_rules
  add column origin text not null default 'manual'
  constraint recurring_rules_origin_check check (origin in ('manual', 'suggestion'));

alter table public.recurring_rules
  add column last_learned_at timestamptz;
