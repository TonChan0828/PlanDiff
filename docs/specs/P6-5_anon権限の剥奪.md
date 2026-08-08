# 仕様書: テーブル権限の最小化(P6-5)

- ステータス: 承認済み(2026-08-08)
- 関連: docs/開発計画.md Phase 6 / docs/specs/P0-6_DBスキーマとRLS.md / CLAUDE.md「DB / RLS 規約」
- 指示資料: なし(`docs/指示資料/` を確認。関連資料なし)

## 目的

CLAUDE.md が定める **「RLS有効・ポリシーゼロ・GRANTなしの三重防御」を実態に一致させる。**

2026-08-07 の本番 `db push` の際、`supabase db diff --linked` で
**本番では `anon` ロールに全テーブルの DELETE/INSERT/SELECT/UPDATE が付与されている**ことが判明した
(`google_tokens` / `pro_interest_events` を含む)。
さらにローカル・本番の両方で、`anon` と `authenticated` に **`TRUNCATE` が付与されている**。

### 現状(実測)

ローカル(`information_schema.role_table_grants`):

| テーブル | anon | authenticated |
|---|---|---|
| google_tokens | REFERENCES, TRIGGER, **TRUNCATE** | REFERENCES, TRIGGER, **TRUNCATE** |
| pro_interest_events | REFERENCES, TRIGGER, **TRUNCATE** | REFERENCES, TRIGGER, **TRUNCATE** |
| profiles | REFERENCES, TRIGGER, **TRUNCATE** | SELECT, UPDATE + REFERENCES, TRIGGER, **TRUNCATE** |
| synced_events / time_entries / recurring_rules / recurring_exceptions | REFERENCES, TRIGGER, **TRUNCATE** | 4種DML + REFERENCES, TRIGGER, **TRUNCATE** |

本番はこれに加えて、**`anon` と `authenticated` の両方に 4種DML** が付いている
(`ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ... TO anon` が原因)。

### なぜ直すか

**現時点で情報漏洩は発生しない。** `google_tokens` / `pro_interest_events` は RLS有効・ポリシーゼロで、
SELECT/INSERT/UPDATE/DELETE は RLS が全拒否する。GRANT だけでは RLS を迂回できない。
`TRUNCATE` は RLS の対象外だが、PostgREST は TRUNCATE を公開しておらず、
Supabase は `anon` にDBログインを与えないため、Data API からは到達できない。

つまり **今はどの経路からも悪用できない**。直す理由は次の2点である。

1. **防御が一段減っている。** 将来 permissive なポリシーが1つ追加された瞬間、あるいは
   RLS が外れた瞬間に、`anon` が全操作可能になる。CLAUDE.md はこれを避けるために
   「GRANTなし」を三重防御の一段目に置いている
2. **新規テーブルにも自動で付く。** 本番の `ALTER DEFAULT PRIVILEGES` により、
   今後追加するテーブルにも `anon` の権限が自動付与される。P6-2 で追加した
   インデックスのように、気づかないまま増える

## 仕様

### 5-A: `anon` から public スキーマの全テーブル権限を剥奪する(マイグレーション)

```sql
revoke all on all tables in schema public from anon;
```

`anon` が public のテーブルに対して持つ権限を**ゼロ**にする。

**安全性の根拠**: 未認証コンテキストで public のテーブルに触る経路は存在しない。
- マーケティングページ(`/` `/pricing` `/privacy` `/terms`)はDBに触らない
- ログイン・サインアップ・パスワード再設定は GoTrue(`auth` スキーマ)であり、public のテーブルではない
- `/api/pro-interest` は service role で書き込む
- サインアップ時の `profiles` 自動作成は `private.handle_new_user()`(SECURITY DEFINER)が行うため、
  呼び出し元ロールの権限に依存しない

### 5-B: `authenticated` の権限を必要最小限に揃え直す(マイグレーション)

一度すべて剥奪し、既存マイグレーションが意図していた権限だけを付け直す。
これにより `TRUNCATE` / `REFERENCES` / `TRIGGER` と、
`google_tokens` / `pro_interest_events` への権限が消える。

```sql
revoke all on all tables in schema public from authenticated;

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.synced_events to authenticated;
grant select, insert, update, delete on public.time_entries to authenticated;
grant select, insert, update, delete on public.recurring_rules to authenticated;
grant select, insert, update, delete on public.recurring_exceptions to authenticated;
-- google_tokens / pro_interest_events には付けない(service role 専用)
```

**`profiles` に INSERT/DELETE を付けない理由**: 作成はトリガ、削除は `auth.users` の CASCADE が担う
(P0-6 の設計)。本番では `authenticated` に DELETE/INSERT が付いていたが、これは既定権限由来であり
アプリは使っていない。

### 5-C: 既定権限を止める(マイグレーション)

今後追加するテーブルに自動で権限が付かないようにする。

```sql
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on tables from authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke all on sequences from authenticated;
```

`service_role` の既定権限は**残す**(サーバー側処理が新規テーブルへ即座にアクセスできる必要があるため)。

**副作用**: 今後テーブルを追加したときは、`authenticated` への GRANT を
マイグレーションに**明示的に書く必要がある**。CLAUDE.md の DB/RLS 規約にこの点を追記する。

#### 実装中に判明した制約(重要)

既定権限は**オブジェクトを作成したロールごと**に定義される。ローカルDBには public スキーマの
テーブルに対して**2組**存在した。

| 所有ロール | 変更前の `anon` | 対象 |
|---|---|---|
| `postgres` | `Dxtm`(TRUNCATE/REFERENCES/TRIGGER/MAINTAIN) | **マイグレーションが作るテーブル** |
| `supabase_admin` | `arwdDxtm`(すべて) | supabase_admin が作るテーブル |

**5-C が消せるのは `postgres` 所有のぶんだけ**。`ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin`
には supabase_admin へのメンバーシップが必要で、ホスト環境の `postgres` は持たない。
またこれは Supabase 管理の設定であり、スコープ外の方針(触らない)に該当する。

**実害はない**。マイグレーションは `postgres` として実行されるため、本リポジトリが作るテーブルには
`postgres` 所有の既定権限が適用される。supabase_admin がこのスキーマにテーブルを作ることはない。

なお `service_role` の既定は変更前から `Dxtm`(DMLなし)であり、**5-C による変更はない**
(マイグレーション適用前後で `pg_default_acl` を実測して確認済み)。
service role が既存テーブルに対して持つ権限は個別 GRANT 由来のため影響を受けない。

## スコープ外

- **Supabase が管理するオブジェクト**(`pg_net` 拡張、`ensure_rls` イベントトリガ、
  `public.rls_auto_enable()` 関数)。本番にのみ存在しローカルには無く、
  マイグレーションで触ると `db reset` が壊れる。**触らない**
- **`auth` / `storage` などSupabase管理スキーマの権限**
- **`service_role` の権限**。RLSを迂回する前提の役割であり、現状のままでよい
- **関数(`private.*`)の EXECUTE 権限**。`private` スキーマは `anon`/`authenticated` に
  USAGE を与えていないため到達できない

## テストシナリオ

### 結合(`tests/integration/table-grants.test.ts` 新規)

- **S1 [結合]**: Given マイグレーション適用後 When `anon` の public テーブル権限を数える
  Then **0件**(どのテーブルにも一切の権限がない)
- **S2 [結合]**: Given 同上 When `authenticated` の権限を集計する
  Then テーブルごとに期待どおりの集合になる
  (profiles=SELECT,UPDATE / synced_events・time_entries・recurring_rules・recurring_exceptions=
  SELECT,INSERT,UPDATE,DELETE / google_tokens・pro_interest_events=なし)
- **S3 [結合]**: Given 同上 When `authenticated` の TRUNCATE 権限を探す Then **0件**
- **S4 [結合]**: Given 同上 When 既定権限(`pg_default_acl`)を確認する
  Then public スキーマの TABLES に `anon` / `authenticated` が含まれない
- **S5 [結合] 非退行**: Given 認証済みユーザー When 自分の予定を作成・取得・更新・削除する
  Then すべて成功する(権限の付け直しで壊れていないこと)
- **S6 [結合] 非退行**: Given ユーザーA/B When Bの文脈でAの行を読む Then 0件(RLSは従来どおり)
- **S7 [結合] 非退行**: Given 未認証(anonキー)のクライアント
  When `synced_events` を読む Then 権限エラーまたは0件で、他人のデータが返らない
- **S8 [結合] 非退行**: Given service role When `google_tokens` を読み書きする Then 従来どおり成功する

### 既存テストの非退行

- `tests/integration/*`(115件)。特に `core-schema.test.ts`(RLS検証)・`account-delete.test.ts`・
  `app-events.test.ts`・`timer-service.test.ts`・`recurring-events.test.ts` ・`pro-interest.test.ts`
- 単体/コンポーネント(601件)はDBに触れないため影響なし

## 完了条件

- S1〜S8 に 1 対 1 で対応するテストが存在し、**全件合格**すること
- `npx supabase db reset` が通り、`npx supabase db diff` の差分がゼロ
- `npm run check` と `npm run test:integration` の出力を確認してから完了を報告する
- CLAUDE.md の「DB / RLS 規約」に「新規テーブルには `authenticated` への GRANT を明示する」を追記
- `docs/logs/YYYY-MM-DD.md` に記録、`docs/開発計画.md` の P6-5 を完了に更新
- **本番への `db push` はユーザー作業**として残す。適用後に
  `db diff --linked` で `anon` の GRANT が消えたことを確認する
