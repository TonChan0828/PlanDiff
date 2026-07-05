# 仕様書: P0-6 DBスキーマ+RLSマイグレーション(コア4テーブル)

- ステータス: 承認済み(2026-07-05。実装計画承認による一括承認)
- 関連: docs/要件定義書.md の §7.1 / §8(FR-01〜08の前提)、docs/開発計画.md P0-6
- 指示資料: なし(docs/指示資料/ を確認済み、2026-07-05時点でREADMEのみ)

## 目的

PlanDiffの全機能(認証・カレンダー同期・タイマー・ギャップ分析)の土台となる4テーブル
(profiles / google_tokens / synced_events / time_entries)を、RLS込みの単一マイグレーションで定義する。
「実行中タイマーは1本」「google_tokensはクライアントから完全遮断」「アカウント削除で全データ連鎖削除」を
**アプリコードではなくDB層で保証する**ことがゴール。

## 仕様

### マイグレーションファイル

- `npx supabase migration new core_schema` で作成(`supabase/migrations/<timestamp>_core_schema.sql`)
- 1ファイル内で「テーブル作成 → RLS有効化 → ポリシー定義」まで完結させる(RLSなしの状態をコミットに残さない)

### 共通規約

- 日時カラムはすべて `timestamptz`(UTC保存)。`timestamp` は使わない
- 外部キーはすべて `auth.users(id)` 参照 + `on delete cascade`(データ全削除要件 §7.2)
- ヘルパー関数は `private` スキーマ + `SECURITY DEFINER` + `set search_path = ''`

### private スキーマの関数・トリガー

| 関数 | 役割 |
|---|---|
| `private.set_updated_at()` | `before update` トリガーで `updated_at` を `now()` に更新 |
| `private.handle_new_user()` | `auth.users` への `after insert` トリガーで `public.profiles` に1行自動作成(`display_name` は `raw_user_meta_data->>'name'`、なければ空文字) |

### テーブル定義

#### 1. profiles(auth.users と 1:1)

| カラム | 型 | 制約 |
|---|---|---|
| id | uuid | PK, references auth.users(id) on delete cascade |
| display_name | text | not null default '' |
| created_at | timestamptz | not null default now() |
| updated_at | timestamptz | not null default now() |

- RLS: `select` / `update` とも本人(`id = (select auth.uid())`)のみ
- `insert` ポリシーは作らない(作成はトリガー経由のみ)。`delete` ポリシーも作らない(削除は auth.users の cascade のみ)

#### 2. google_tokens(サーバー専用。**ポリシーを一切作らない**)

| カラム | 型 | 制約 |
|---|---|---|
| user_id | uuid | PK, references auth.users(id) on delete cascade |
| refresh_token | text | not null |
| created_at | timestamptz | not null default now() |
| updated_at | timestamptz | not null default now() |

- RLSは**有効化のみ**。SELECTを含む一切のポリシーを作成しない → anon / authenticated からは読み書き不可、service role のみアクセス可能
- アクセストークンのキャッシュ列(access_token / expires_at 等)はP1-2で必要になった場合に別マイグレーションで追加する(先回りしない)

#### 3. synced_events(Googleカレンダー予定のキャッシュ)

| カラム | 型 | 制約 |
|---|---|---|
| id | uuid | PK default gen_random_uuid() |
| user_id | uuid | not null, references auth.users(id) on delete cascade |
| google_event_id | text | not null |
| title | text | not null default '' |
| start_at | timestamptz | not null |
| end_at | timestamptz | not null |
| synced_at | timestamptz | not null default now() |

- 制約: `unique (user_id, google_event_id)`(同期の upsert キー)、`check (end_at >= start_at)`
- インデックス: `(user_id, start_at)`(週表示の範囲クエリ用)
- RLS: select / insert / update / delete の4本を個別に定義、すべて本人のみ(`user_id = (select auth.uid())`、insert/update は `with check` も)
  - 同期処理(P1-2)はユーザーセッションのサーバークライアントで書き込む想定のため、本人書き込みを許可する

#### 4. time_entries(実績記録。end_at IS NULL = 実行中タイマー)

| カラム | 型 | 制約 |
|---|---|---|
| id | uuid | PK default gen_random_uuid() |
| user_id | uuid | not null, references auth.users(id) on delete cascade |
| title | text | not null |
| google_event_id | text | nullable(null = フリータイマー/割り込み) |
| start_at | timestamptz | not null |
| end_at | timestamptz | nullable(null = 実行中) |
| created_at | timestamptz | not null default now() |
| updated_at | timestamptz | not null default now() |

- 制約: `check (end_at is null or end_at >= start_at)`
  (開始直後の即停止で end = start になり得るため `>=`。ゼロ秒実績は許容し、UI側で扱いを決める)
- **実行中タイマー1本制約**(このマイグレーションの核):
  ```sql
  create unique index one_running_timer_per_user
    on public.time_entries (user_id) where (end_at is null);
  ```
- インデックス: `(user_id, start_at)`
- RLS: synced_events と同じ4本構成(本人のみ)
- `google_event_id` は synced_events への FK に**しない**(キャッシュ行の削除・再同期で実績が消えるのを防ぐ。紐づけはアプリ層で解決)

### マイグレーションSQL(ドラフト全文)

```sql
-- private スキーマとヘルパー
create schema if not exists private;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''));
  return new;
end;
$$;

-- 1) profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (id = (select auth.uid()));
create policy "profiles_update_own" on public.profiles
  for update using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- 2) google_tokens(RLS有効化のみ。ポリシーは一切作らない)
create table public.google_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_tokens enable row level security;

create trigger set_google_tokens_updated_at
  before update on public.google_tokens
  for each row execute function private.set_updated_at();

-- 3) synced_events
create table public.synced_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  google_event_id text not null,
  title text not null default '',
  start_at timestamptz not null,
  end_at timestamptz not null,
  synced_at timestamptz not null default now(),
  constraint synced_events_time_range check (end_at >= start_at),
  constraint synced_events_user_event_unique unique (user_id, google_event_id)
);

create index synced_events_user_start_idx
  on public.synced_events (user_id, start_at);

alter table public.synced_events enable row level security;

create policy "synced_events_select_own" on public.synced_events
  for select using (user_id = (select auth.uid()));
create policy "synced_events_insert_own" on public.synced_events
  for insert with check (user_id = (select auth.uid()));
create policy "synced_events_update_own" on public.synced_events
  for update using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "synced_events_delete_own" on public.synced_events
  for delete using (user_id = (select auth.uid()));

-- 4) time_entries
create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  google_event_id text,
  start_at timestamptz not null,
  end_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint time_entries_time_range check (end_at is null or end_at >= start_at)
);

create unique index one_running_timer_per_user
  on public.time_entries (user_id) where (end_at is null);
create index time_entries_user_start_idx
  on public.time_entries (user_id, start_at);

alter table public.time_entries enable row level security;

create policy "time_entries_select_own" on public.time_entries
  for select using (user_id = (select auth.uid()));
create policy "time_entries_insert_own" on public.time_entries
  for insert with check (user_id = (select auth.uid()));
create policy "time_entries_update_own" on public.time_entries
  for update using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "time_entries_delete_own" on public.time_entries
  for delete using (user_id = (select auth.uid()));

create trigger set_time_entries_updated_at
  before update on public.time_entries
  for each row execute function private.set_updated_at();

-- 5) Data API への公開(明示GRANT)
-- 新規テーブルはデフォルトでは Data API ロール(anon / authenticated / service_role)に
-- 公開されないため(auto_expose無効。Supabaseの新デフォルト)、意図するアクセス範囲だけを明示的にGRANTする。
-- google_tokens は anon / authenticated にGRANTしない(service role のみ)。
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.synced_events to authenticated;
grant select, insert, update, delete on public.time_entries to authenticated;

grant all on public.profiles to service_role;
grant all on public.google_tokens to service_role;
grant all on public.synced_events to service_role;
grant all on public.time_entries to service_role;
```

> **実装時の補記(2026-07-05)**: ドラフトSQLにはGRANT文がなかったが、Supabaseの新デフォルト
> (`auto_expose_new_tables` 無効)では新規テーブルがData APIロールに公開されず、RLSポリシーが
> あってもアクセスできない。仕様の意図するアクセス範囲(本人のみ/google_tokensはservice roleのみ)と
> 1:1で対応する明示GRANTを追加した。アクセス制御の実質はRLSポリシー側で変わらない。

### 結合テスト実行基盤(本項目で整備する)

単体テスト(jsdom)と分離した結合テスト環境を新設する:

- 配置: `tests/integration/**/*.test.ts`(environment: node)
- vitest.config.ts の既存 `include` から `tests/integration/**` を除外し、結合用設定(`vitest.config.integration.ts`)を追加
- npm scripts: `test:integration` = `vitest run --config vitest.config.integration.ts`
- 前提: ローカルSupabase(`npx supabase start`)が起動済みであること。**起動していない場合はテストを失敗させる**(skipで通過扱いにしない)
- テストはservice roleクライアントで一時ユーザーを作成し(`auth.admin.createUser`)、anonキー+パスワードサインインでユーザー文脈のクライアントを作ってRLSを検証する。テスト終了時に一時ユーザーを削除
- `npm run check` には結合テストを**含めない**(ローカルSupabase起動が前提のため)。スキーマ変更を含むタスクのDoDに「`npm run test:integration` 全件合格」を追加で課す

### エラー時の挙動(DB層で保証するもの)

| 操作 | 期待される失敗 |
|---|---|
| 実行中タイマーがある状態で `end_at IS NULL` の行を追加 | unique violation(23505) |
| 他人の `user_id` で insert / 他人の行の select | RLS違反(insert は 42501、select は 0行) |
| anon / authenticated から google_tokens への一切のアクセス | 0行 or 権限エラー(ポリシー不存在) |
| `end_at < start_at` の行 | check violation(23514) |

## スコープ外

- アクセストークンのDBキャッシュ列(P1-2で判断)
- Free枠「履歴2週間」の制限(課金実装とセットで将来判断。スキーマでは制限しない)
- トークンの暗号化保存(Supabase Vault)。MVPは「専用テーブル+ポリシーなし+service role限定」で担保し、v2で再検討(要件定義書 §7.1「検討」レベル)
- 終日イベントの扱い(同期対象に含めるかはP1-2の仕様で決める。スキーマは timestamptz で両対応可能)
- Supabaseプロジェクト(リモート)への適用(P0-1完了後。本項目はローカル検証まで)

## テストシナリオ

単体シナリオなし(本項目はSQLマイグレーションのみでアプリコードのロジックを含まないため。
結合テストがDB挙動を直接検証する)。→ この例外の妥当性も承認対象。

- S1 [結合] 正常系: Given 空のローカルDB When `npx supabase db reset` を実行 Then エラーなく完了し、4テーブルすべてが存在し、4テーブルすべてで `relrowsecurity = true` である
- S2 [結合] 正常系: Given 新規ユーザーを `auth.admin.createUser` で作成 When profiles を本人クライアントで select Then トリガーで自動作成された1行(display_name反映済み)が取得できる
- S3 [結合] 正常系: Given ユーザーAでサインイン済みクライアント When 自分の time_entries を insert → select → update → delete Then すべて成功する
- S4 [結合] 異常系: Given ユーザーAとユーザーBのデータが存在 When Aのクライアントで Bの time_entries / synced_events を select Then 0行。When Aが `user_id = B` で insert Then RLS違反で失敗する
- S5 [結合] 異常系: Given ユーザーAでサインイン済みクライアント(authenticated ロール) When google_tokens を select / insert Then いずれも失敗する(行が返らない/権限エラー)。And service role クライアントでは読み書きできる
- S6 [結合] 境界値: Given ユーザーAに実行中タイマー(end_at IS NULL)が1本ある When 2本目の end_at IS NULL 行を insert Then unique violation で失敗する。When 1本目の end_at を更新して停止した後に新しい実行中行を insert Then 成功する
- S7 [結合] 境界値: Given time_entries に `end_at = start_at` の行を insert Then 成功する(ゼロ秒実績は許容)。When `end_at < start_at` の行を insert Then check violation で失敗する
- S8 [結合] 正常系: Given ユーザーAに4テーブルすべてのデータが存在 When `auth.admin.deleteUser(A)` を実行 Then 4テーブルすべてからAの行が消える(cascade)
- S9 [結合] 正常系: Given time_entries の既存行 When update を実行 Then `updated_at` が更新前より進んでいる(トリガー動作)
- S10 [結合] 異常系: Given 同一ユーザー・同一 google_event_id の synced_events が存在 When 同じキーで2行目を insert Then unique violation で失敗する(= 同期は upsert で行う前提の確認)
