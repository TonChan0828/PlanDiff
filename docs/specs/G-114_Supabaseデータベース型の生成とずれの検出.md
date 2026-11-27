# 仕様書: G-114 Supabase のデータベース型を生成し、マイグレーションとのずれを CI で検出する

- ステータス: 承認済み(2026-11-24)
- 関連: GitHub Issue #114(優先度P1・開発基盤) / `lib/supabase/{server,browser,admin}.ts` / `.github/workflows/ci.yml`(integration ジョブ)
- 指示資料: なし(2026-11-24 に `docs/指示資料/` を確認。README のみ)

## 目的

Supabase クライアントに DB 固有の型がなく、テーブル名・列名・RPC の引数を変えても、アプリ側の追従漏れを型検査で検出できない。
マイグレーションを適用したローカル DB から型を生成し、クライアントに適用して、ずれを CI で検出する。

## 仕様

1. **型の生成**: `npm run db:types` を追加する。`supabase gen types typescript --local --schema public`(ローカル Supabase 起動・マイグレーション適用済みが前提)の出力を
   `lib/supabase/database.types.ts` に書き出す。バージョンは CI と同じ Supabase CLI(2.107.0)
   - 生成物は**コミットする**。`.prettierignore` に追加し、`format:check` が生成物の書式で落ちないようにする。ファイル先頭に「自動生成・手編集禁止」の注記を付ける
2. **クライアントへの適用**: `createServerClient<Database>` `createBrowserClient<Database>` `createClient<Database>`(admin)に型を渡し、
   `type AppSupabaseClient = SupabaseClient<Database>` を `lib/supabase/types.ts` に定義する
   - 関数の引数で使う `SupabaseClient` を `AppSupabaseClient` へ置き換える(`lib/**` の関数)
   - 型付けで出た既存コードの型エラーは**呼び出し側を直して解消**する。`any` や型アサーションの追加で隠さない。
     やむを得ない箇所(JSON 列など)は理由コメントを付ける
   - 結合テスト用ヘルパー(`tests/integration/helpers.ts`)は型なしのままでよい(RLS 越しの検証用で、型が邪魔になる箇所があるため)。変更するなら理由を記録する
3. **CI での差分検出**: integration ジョブで空のローカル DB を起動して全マイグレーションの適用を確認した後に、型を再生成し `git diff --exit-code lib/supabase/database.types.ts` で
   コミット済みとの差分があれば失敗させる。失敗メッセージに `npm run db:types` での更新手順を出す
4. **運用**: マイグレーションを追加した PR は `npm run db:types` を実行して生成物を同じ PR に含める。手順を `.claude/skills/db-migration` と
   `README` のコマンド欄に追記する(db-migration Skill への追記が必要なため、承認時に確認)

## エラー時の挙動

- 生成に失敗したら CI は失敗する(空ファイルで通さない)

## スコープ外

- `private` スキーマの型(アプリから直接呼ばない)
- テストヘルパーの型付け
- Zod など実行時スキーマの導入

## テストシナリオ

- F1 [型検査]: 存在しない列名を `.select("no_such_column")` に渡すとコンパイルエラーになる(`// @ts-expect-error` の型テスト。typecheck で固定)
- F2 [型検査]: 存在しないテーブル名・RPC 名・誤った引数名/型の `rpc` 呼び出しがコンパイルエラーになる(主要 RPC `start_timer` `stop_timer` で固定)
- F3 [型検査]: 正しい列名・引数でコンパイルが通り、戻り値の型が列の型になる(`expectTypeOf`)
- F4 [単体]: 既存の単体・画面テストが全件合格する(型だけの変更で挙動は変わらない)
- F5 [結合]: 既存の結合テストが全件合格する
- F6 [CI]: ローカルで列を追加するマイグレーションを一時的に足して再生成せずに差分検出が失敗することを確認し、再生成後に合格する(確認後にマイグレーションは破棄)
- F7 [CI]: `format:check` が生成物を無視して合格する
