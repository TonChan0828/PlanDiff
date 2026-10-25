# S-5の本番反映と確認

この手順はレビュー用です。本番のマイグレーション、秘密鍵登録、公開、監視登録はまだ実行していません。

## 反映順序

1. DBバックアップと復旧手順を確認します。マイグレーションの対象が本番プロジェクトであることを確認し、適用前の履歴と差分を保存します。
2. `20261025014726_security_hardening.sql` と `20261025020158_move_btree_gist_to_extensions.sql` を順に適用します。追加内容は削除例外の所有者制約、不整合行の非公開隔離、計測の回数制限用関数・テーブル、毎分の削除ジョブ、入力検証と監視用関数、拡張機能の配置修正です。既存の公開テーブルへのクライアント権限は増やしません。
3. サーバー環境変数 `APP_ORIGIN` に正規の公開元（例: `https://plandiff.app`。実際の公開ドメインに合わせます）を登録します。`PRO_INTEREST_HMAC_SECRET` に暗号学的乱数32バイト以上の秘密値を登録します。環境ごとに別の値を使い、`NEXT_PUBLIC_` は付けません。既存の `CRON_SECRET` も必要です。
4. `SECURITY_LOCAL_TESTS` は本番へ登録しません。これはローカルDBを使うブラウザーテスト専用です。Previewは `VERCEL_URL` と `APP_ORIGIN` の正確な公開元だけを許可します。Vercel前段に別のプロキシがある場合は、上書きされる送信元IPヘッダーを確認します。
5. Previewで後述の確認を行い、アプリを公開します。新しいDB関数または設定が不足している場合、計測APIは503になり、制限なしでの保存には切り替わりません。
6. 認証付き `GET /api/cron/security-health` を毎分呼び出す監視を登録します。`Authorization: Bearer <CRON_SECRET>` を使用し、秘密値は監視サービスの秘密設定で管理します。200は正常、503は削除ジョブの異常または10分を超えたカウンターの残存です。401は監視の認証設定不備です。新規適用後、最初の毎分ジョブが成功するまでは503です。

## 認証基盤の確認

- 最低パスワード長8文字、メール確認必須、確認メールとパスワード再設定の転送先を正確な公開URLに限定します。
- セッションの有効期間、更新トークンのローテーション、パスワード変更時の再認証設定を確認し、現状と判断を記録します。ローカルの開発向け設定値をそのまま本番へ適用しません。
- 一般利用者から管理者用関数を実行できないこと、全テーブルのRLS・権限、適用履歴を確認します。

## 公開後の確認

- `/`・`/pricing`・`/privacy`・`/terms`・認証画面・ログイン後の各画面にCSPがあり、HTML内のnonceと一致し、別リクエストでは変わることを確認します。HTMLは `private, no-store` で配信します。
- CSPのscript-srcに `unsafe-inline` / `unsafe-eval` がなく、外部埋め込みを拒否し、テーマ・画面遷移・認証・予定・タイマー・通知が動作することを確認します。
- 計測APIの正常時204、形式不正400/415、送信元不一致403、本文超過413、上限超過429とRetry-Afterを確認します。本番で大量送信はせず、上限検証は使い捨てDBで実施します。
- 監視の503、計測APIの429/503、保存イベント数、画面応答時間を配信基盤のログ・メトリクスで確認します。IP・短期識別値・鍵・リクエスト本文を追加ログに出しません。
- 削除処理停止時は受付が停止しますが、DB内の値の物理消去は復旧後です。バックアップの保持期間は基盤設定を確認します。短期識別値をバックアップも含めて10分以内に物理消去すると表現しません。

## 読み取り専用のDB確認例

秘密値や識別値そのものを表示せず、件数・時刻・状態だけを確認します。

```sql
select version from supabase_migrations.schema_migrations order by version desc limit 3;
select count(*) as quarantined_rows from private.quarantined_recurring_exceptions;
select count(*) as expired_limit_rows from private.pro_interest_limits
where window_at < now() - interval '10 minutes';
select jobname, active from cron.job where jobname = 'plandiff-pro-interest-purge';
select d.status, d.start_time, d.end_time from cron.job_run_details d
join cron.job j on j.jobid = d.jobid where j.jobname = 'plandiff-pro-interest-purge'
order by d.start_time desc limit 5;
select public.analytics_security_health();
```

## 問題時

計測用秘密鍵の設定を外すと計測受付を503で停止できます。保護された他のアプリ操作は継続します。CSPの問題は個別の修正として扱い、所有者制約と修正版の依存は維持します。新しい計測APIの導入後、回数制限のない旧APIへそのまま戻さないでください。DBの制約を取り消す代わりに、必要な追加マイグレーションで修正します。
