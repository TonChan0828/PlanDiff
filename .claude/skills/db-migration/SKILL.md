---
name: db-migration
description: Use when creating or changing ANY database table, column, index, RLS policy, or Postgres function in this repo - enforces the migration -> RLS -> app code order and this project's RLS security patterns. Invoke BEFORE writing any SQL.
---

# DBスキーマ変更ワークフロー(PlanDiff)

スキーマ変更は必ず「マイグレーションSQL → RLSポリシー → アプリコード」の順で提示・実装する(CLAUDE.md)。
ダッシュボード直編集は禁止。spec-driven-dev のワークフロー(仕様書承認)を前提とする。

## 手順

1. `npx supabase migration new <説明的な名前>` でファイルを作成する(`supabase/migrations/`)
2. マイグレーションSQLを書く。**同一マイグレーション内で** RLS有効化とポリシーまで完結させる(RLSなしの状態をコミットに残さない)
3. ローカルで検証: `npx supabase db reset`(全マイグレーション再適用)→ エラーがないこと
4. `npx supabase db diff` で意図しない差分がないことを確認
5. アプリコード(型・クライアント)を変更する

## このプロジェクトのRLSパターン(必須)

```sql
-- 1) テーブル作成後、必ず即RLS有効化
alter table public.<table> enable row level security;

-- 2) ヘルパー関数は private スキーマ + SECURITY DEFINER + search_path固定
create schema if not exists private;
create or replace function private.<fn>() returns ... 
language sql security definer
set search_path = ''  -- 必ず明示固定
as $$ ... $$;

-- 3) 本人のみアクセスの基本形
create policy "<table>_select_own" on public.<table>
  for select using (user_id = (select auth.uid()));
-- insert/update/delete も同様に個別に定義(for all を安易に使わない)
```

## テーブル固有ルール

- **google_tokens**: ポリシーを**一切作らない**(SELECTも含む)。RLS有効化のみ行い、service role経由のサーバー処理だけが読み書きする
- **time_entries**: 実行中タイマー1本制約をDBで保証する:
  ```sql
  create unique index one_running_timer_per_user
    on public.time_entries (user_id) where (end_at is null);
  ```
- 日時カラムは `timestamptz`(UTC保存)。`timestamp` は使わない
- 外部キーは `auth.users(id)` 参照 + `on delete cascade`(データ全削除要件のため)

## チェックリスト(完了前に確認)

- [ ] 全テーブルでRLSが有効(`enable row level security` がある)
- [ ] google_tokens にポリシーを付けていない
- [ ] SECURITY DEFINER 関数に `set search_path` がある
- [ ] `npx supabase db reset` が通る
- [ ] マイグレーション適用後に既存テストが全件通る
