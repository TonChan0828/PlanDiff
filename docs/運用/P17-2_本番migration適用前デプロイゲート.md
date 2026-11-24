# 本番migration適用前のデプロイゲート

P17-2は、本番Supabaseのmigration履歴がリポジトリと一致した後にだけ、VercelのProduction deploymentを本番ドメインへ昇格させる。GitHub Actionsは履歴を読むだけで、migrationを適用しない。

## 初回設定

### GitHub Environment

1. GitHub repositoryの **Settings → Environments** で `production-migration-check` Environmentを作成する。
2. Deployment branchesを `main` のみに制限する。
3. Environment secretsに次の3つを登録する。

   - `SUPABASE_ACCESS_TOKEN`: `supabase link` に使うScoped Personal Access Token。対象ProjectのProject Settings、API Keys、API Key Secretsを読む権限を与える。
   - `SUPABASE_PROJECT_REF`: Supabase Project Settingsに表示されるProject reference ID。
   - `SUPABASE_DB_PASSWORD`: 対象ProjectのDatabase password。

SupabaseではCI用に権限を絞ったScoped Personal Access Tokenを使う。値をGitHub Actionsのログやコードへ貼り付けない。

### Vercel Deployment Checks

1. Vercel ProjectのGit設定でGitHub repository連携を確認する。
2. Production Environment設定で自動aliasingを有効にする。
3. **Project Settings → Deployment Checks → Add Checks → GitHub** を開き、`Production migration readiness` workflowの `Production migration history` checkを追加する。
4. 次のProduction deploymentでcheckが待機状態になり、GitHub workflow成功後に本番ドメインへ昇格することを確認する。

このDashboard設定が済む前は、GitHub workflowが失敗してもVercelの昇格は止まらない。Vercelの **Force Promote** はcheckを迂回できるため、migration未適用のまま使用しない。

## migrationを含む変更の運用

1. mainへの変更をmergeすると `Production migration readiness` が起動し、Production Supabaseの履歴と `supabase/migrations/` のtimestampを比較する。
2. checkが成功するまでVercelはbuildを本番ドメインへaliasしない。
3. checkが失敗したらGitHub Actions runを開き、不一致または認証設定を確認する。CLIの接続・出力エラーは秘密情報を伏せた固定エラーとして表示される。
4. 未適用migrationが原因なら、SQLと対象環境を確認し、必要に応じて `npx supabase db push --linked --dry-run` で適用予定を確認する。その後、本番適用を承認された利用者が `npx supabase db push --linked` を実行する。
5. 同じcommitに紐づく失敗したActions runを **Re-run jobs** する。ただし、Vercel 側で check が「失敗」と確定した deployment は、Re-run で成功しても自動では本番ドメインへ昇格しないことがある(2026-10-25 に確認。2026-11-21 は自動で昇格済みだった)。
   そのため、Re-run のあとに必ず次で確認する:
   - `vercel inspect plandiff.vercel.app` で、本番ドメインが対象の deployment を指しているかを見る
   - 指していなければ `vercel promote <deployment-url>` で昇格する。`409 already the current production deployment` は昇格済みを意味する
   - **未適用の migration は、マージ前に本番へ適用する**のが最も確実(ゲートの失敗と再実行そのものを避けられる)

本番migrationを自動適用しない。`migration repair` も自動実行しない。

## このcheckが確認する範囲と、確認しないもの

- **確認する**: `supabase/migrations/` のファイル名のタイムスタンプと、本番の `schema_migrations` の履歴が一致すること(`scripts/check-migration-history.mjs`)
- **確認しない**: テーブル定義・列・制約・RLSポリシー・GRANT・関数の中身。履歴が一致していても、本番を手で変更した(ダッシュボード直編集など)場合や、migration を途中まで適用して止まった場合のずれは検知しない

### 範囲外のずれを確認する運用

migration を含むリリースの前後(特に本番へ `db push` した直後)に、読み取りのみのコマンドで本番と migration の差を見る。

```
npx supabase db diff --linked --schema public
```

- 本番へは書き込まない(本番の現状と、migration から再現したスキーマを比較するだけ)。比較用に Docker のコンテナを一時的に起動する
- 「No schema changes found」なら、`public` スキーマに履歴外のずれはない
- 差分が出たら、本番を直接変更した変更か、migration の漏れかを確認し、migration を追加して揃える(ダッシュボードで直さない)
- 2026-11-24 に実行し、`public` スキーマは差分なし(G-111)

## Vercel の設定の確認方法

Deployment Checks の登録は Dashboard でしか確認できない(API では読めない)。

- 場所: Vercel → Project(plandiff)→ **Settings → Deployment Checks**
- 正しい状態: GitHub の check として `Production migration history`(workflow `Production migration readiness`)が登録され、本番(Production)の公開の必須条件になっている
- 実績での確認: 失敗側は 2026-10-25(migration 未適用のまま merge した deployment の公開が保留された)。成功側は 2026-11-21 と 2026-11-24(migration 適用後の merge は、workflow の成功直後に本番ドメインへ反映された)。
  2026-11-24 の `ef3d1fe` は workflow 完了 14:06:31(UTC)の1秒後に alias が完了している。deployment の `checks` には `deployment-alias` しか出ないため、Dashboard の画面で登録を直接確認すること

Supabase GitHub IntegrationがDashboardで別途有効な場合、このWorkflowとは独立してmigrationを適用することがある。本PRはその外部設定を確認・変更しない。Deployment Checkはremote履歴が一致するまでアプリの昇格を保留する。

参照: [Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations)、[Supabase Personal Access Tokens](https://supabase.com/docs/guides/platform/personal-access-tokens)、[Vercel Deployment Checks](https://vercel.com/docs/deployment-checks)
