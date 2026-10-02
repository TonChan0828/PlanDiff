# 仕様書: タイマーRPC失敗の診断ログ

- ステータス: 実装完了(2026-10-03。PR #82でmainへマージ済み)
- 関連: [docs/specs/P16-data_集計と記録の整合性.md](P16-data_集計と記録の整合性.md)、[docs/specs/P16-ops_検証と運用の改善.md](P16-ops_検証と運用の改善.md)
- 指示資料: なし(`docs/指示資料/` は `README.md` のみ)

## 目的

`start_timer` / `stop_timer` のDB RPCが失敗すると、タイマーサービスは画面互換のため `{ ok: false }` を返すが、現在は失敗理由を記録しない。本番でDB関数が未適用だった障害を、個人情報や予定内容をログへ出さずに診断できるようにする。

## 仕様

- 対象は `lib/timer/service.ts` の `callTimerRpc` が呼ぶ `start_timer` と `stop_timer` の失敗だけとする。
- Supabase RPCが `{ error }` を返した場合と、RPC呼び出しが例外を投げた場合の両方で、失敗イベントを1回記録する。
- イベント名は固定文字列 `timer_rpc_failed` とし、ログ項目は許可済みRPC名(`start_timer` / `stop_timer`)と正規化したコードだけにする。
- Supabaseが返したDBエラーの `code` は `/^[A-Z0-9]{5}$/` に一致する場合だけ記録し、それ以外や欠落時は `UNKNOWN` とする。RPC呼び出し自体が投げた例外は、独自の `code` プロパティを含めて常に `UNKNOWN` とする。
- ログは `console.error("timer_rpc_failed", { operation, code })` 相当の固定形式にする。`message`、`details`、`hint`、`stack`、RPC引数、予定タイトル、GoogleイベントID、ユーザーID、URLは記録しない。
- 既存の承認済みP16-ops仕様はログ項目をイベント種別・発生箇所・既知のページパス・標準エラー名・Next digestに限定している。本仕様を採用する場合に限り、タイマーRPCの障害診断に必要な `operation` と検証済み5文字コードを追加する。ほかのログの許可項目は広げない。この限定的な許可項目の追加は新しい仕様変更として承認を得る。
- RPC失敗を判定した後にログを1回だけ試みる。ログ出力自体が例外を投げても再記録せず、元の `{ ok: false }` を維持する。ログ例外をRPC例外として扱わない。
- RPC成功時と、認証確認でRPC呼び出しに到達しない場合は失敗イベントを記録しない。
- 失敗時の戻り値 `{ ok: false }`、成功時の戻り値、Server Actionの再検証動作は変えない。

## スコープ外

- 本番migrationの適用順やVercelデプロイを制御する仕組み
- UIのエラーメッセージや再試行導線の変更
- Push通知、アラート、外部監視サービスとの連携
- `updateTimeEntry` / `updateRunningStart` / `deleteTimeEntry` の診断ログ

## テストシナリオ

- S1 [単体]: `start_timer` と `stop_timer` が有効な5文字DBエラーコードを返すとき、それぞれ `{ ok: false }` と固定イベント・許可済みRPC名・コードを1回記録する。
- S2 [単体]: DBエラーの `code` が欠落または不正で、`message` / `details` / `hint` に任意文字列が含まれるとき、コードを `UNKNOWN` として記録し、それ以外のDBエラー情報をログへ含めない。有効コードの場合も許可項目以外が出ないことを確認する。
- S3 [単体]: `start_timer` と `stop_timer` の呼び出しが例外を投げるとき、例外に有効らしい `code` が付いていても `UNKNOWN` とし、メッセージとstackを含めず、失敗イベントを1回記録して `{ ok: false }` を返す。
- S4 [単体]: 失敗イベントの出力で `console.error` が例外を投げるとき、再記録を試さず、タイマーサービスは `{ ok: false }` を返す。
- S5 [結合]: 認証済みユーザーのローカルSupabaseで、既存実行中タイマーを保持したまま `start_timer` のINSERTをNOT NULL違反にする。サービスはDBが返す `23502` を許可項目だけで記録し、`{ ok: false }` を返し、既存タイマーが変更されないことを確認する。
- S6 [単体]: RPC成功時と未認証でRPCを呼ばないとき、失敗イベントを記録しない。
