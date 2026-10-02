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
5. 同じcommitに紐づく失敗したActions runを **Re-run jobs** する。履歴が一致すればcheckが成功し、Vercelがdeploymentを昇格する。

本番migrationを自動適用しない。`migration repair` も自動実行しない。履歴が一致しても、このcheckは履歴外のschema driftを検知しない。

Supabase GitHub IntegrationがDashboardで別途有効な場合、このWorkflowとは独立してmigrationを適用することがある。本PRはその外部設定を確認・変更しない。Deployment Checkはremote履歴が一致するまでアプリの昇格を保留する。

参照: [Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations)、[Supabase Personal Access Tokens](https://supabase.com/docs/guides/platform/personal-access-tokens)、[Vercel Deployment Checks](https://vercel.com/docs/deployment-checks)
