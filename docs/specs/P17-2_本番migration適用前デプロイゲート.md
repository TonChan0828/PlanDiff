# 仕様書: 本番migration適用前のデプロイゲート

- ステータス: 承認済み(2026-10-03。ユーザーの「設計は承認するものとして」による)
- 関連: [docs/specs/P17-1_タイマーRPC失敗の診断ログ.md](P17-1_タイマーRPC失敗の診断ログ.md)、[Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations)、[Vercel Deployment Checks](https://vercel.com/docs/deployment-checks)
- 運用手順: [docs/運用/P17-2_本番migration適用前デプロイゲート.md](../運用/P17-2_本番migration適用前デプロイゲート.md)
- 指示資料: なし(`docs/指示資料/` は `README.md` のみ)

## 目的

本番Supabaseへmigrationを適用する前に、mainのアプリケーションコードだけが本番ドメインへ公開される状態を防ぐ。GitHub Actionsは本番のmigration履歴を読み取り照合し、Vercel Deployment Checksが成功するまで本番ドメインへの昇格を保留する。

## 仕様

- GitHub Actionsに `Production migration readiness` ワークフローを追加する。`main` へのpushと `workflow_dispatch` で起動する。
- `production-migration-check` GitHub Environmentに登録した `SUPABASE_ACCESS_TOKEN`、`SUPABASE_PROJECT_REF`、`SUPABASE_DB_PASSWORD` だけを使い、本番Supabaseへリンクして確認する。
- Supabase CLIはCIと同じ `2.107.0` に固定する。照合コマンドは `supabase migration list --linked --password ...` とし、アプリのmigrationファイル、CLIが示すlocal履歴、remote履歴のtimestamp集合がすべて一致することを成功条件とする。
- CLI表を厳格に解析する。想定外の形式、重複timestamp、CLIエラー、接続失敗、必要な環境変数の欠落はすべて失敗とし、CLIの生出力やエラー、秘密値をログへ出さない。
- 照合スクリプトは `migration list` 以外の書き込みコマンドを実行しない。`db push`、`migration repair`、DDL、データ変更を実行しない。
- 履歴不一致時はGitHub checkを失敗させ、VercelのDeployment Checksで本番ドメインへの自動昇格を止める。利用者がmigrationを適用した後、対象commitのActions runを再実行する。
- Supabase migrationの本番適用は引き続き利用者が明示的に実施する。適用前の変更内容を確認し、必要なら `npx supabase db push --linked --dry-run` を実行してから `npx supabase db push --linked` を行う。
- GitHubの `production-migration-check` Environment secretsとVercelのDeployment ChecksはDashboard上で利用者が設定する。Vercel側では、このWorkflowの `Production migration history` checkをrequired checkとして選ぶ。設定手順と運用手順をリポジトリに記録する。
- Production Deployment Checkが有効になるまでは、このWorkflow単独ではVercelのドメイン昇格を止めない。VercelのForce Promoteはcheckを迂回できるため、通常運用では使わない。
- Supabase GitHub IntegrationがDashboardで別途有効な場合、このWorkflowとは独立してmigrationを適用する可能性がある。本変更はその設定を確認・変更しない。Deployment Checkはremote履歴の一致を待ってからアプリを昇格する。

## スコープ外

- 本番Supabase migrationの自動適用、履歴修復、schema drift検知
- Vercel DashboardやGitHub Environment/Secretsへの自動変更
- Preview deployment、Supabase branch database、他環境のmigration制御
- Vercel/GitHubの契約プランやリポジトリ権限変更

## テストシナリオ

- S1 [単体]: local/remote双方に同じtimestampが並ぶCLI表を解析し、期待するmigrationファイル集合と一致すれば成功する。
- S2 [単体]: localにのみ存在するtimestampがある場合、履歴不一致として失敗し、不一致のtimestampを明示する。
- S3 [単体]: remoteにのみ存在するtimestamp、またはmigrationファイルにないCLI local timestampがある場合、履歴不一致として失敗する。
- S4 [単体]: CLIエラーまたは想定外・不完全・重複行の出力を失敗とし、CLI stderrや接続情報をエラーへ含めない。
- S5 [結合/CI]: disposable local Supabaseへ全migrationを適用した後、実際の `supabase migration list --local` 出力を照合し、ローカルDB履歴がmigrationファイル集合と一致する。
- S6 [設定検証]: production workflowがmain pushと手動起動だけを受け、読み取り専用照合を行う。workflowにmigration適用・repairコマンドが含まれず、Vercel required checkと必要なEnvironment secretsの手順が文書化される。

## 運用上の限界

この確認はSupabaseの `schema_migrations` 履歴を比較する。履歴外で行われたschema変更やmigration SQLの意味的な違いは検知しない。履歴の完全一致は、schema driftがないことの証明ではない。
