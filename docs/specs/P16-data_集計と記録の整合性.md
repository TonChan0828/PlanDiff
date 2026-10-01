# 仕様書: P16-data 集計と記録の整合性

- ステータス: 承認済み(2026-09-30。調査結果の実装・ワークツリー並列作業の指示)
- 関連: P7-1(日別グラフ)、P8-3(利用者TZ)、P5-1(定期予定)、P2-2(予定連動タイマー)、P6-0(ページング)
- 指示資料: docs/指示資料/ はREADMEのみ。今回の追加資料なし

## 目的

サーバーTZと利用者TZが異なる場合の日別集計の欠落、削除例外の取得失敗時の予定復活、
タイマー切替途中の失敗による意図しない停止を防ぐ。

## 仕様

### 日別集計

日付indexの計算は必ず集計期間のDate/TZDateを基準に行う。入力予定・実績のUTC時刻を
同じタイムゾーンへ変換し、初日から最終日まで各ローカル暦日に全量を計上する。
日別系列の予定・実績合計はcomputeGapSummaryの値と一致する。通常のDate入力は従来互換。

### 定期予定の削除例外

recurring_exceptionsは既存の範囲フィルタを維持し、rule_id・occurrence_dateの一意順で
既存ページングヘルパーを使い全ページ取得する。どのページでも失敗した場合、または件数上限を
超えた場合は実体化の書き込みを一切行わず、ルール一覧を返して既存の表示を継続する。
サーバーログは固定の日本語メッセージのみ。正常時は全ページの削除例外を反映する。

### タイマーの切替と停止

public.start_timer(p_title text, p_google_event_id text default null)と
public.stop_timer()をSECURITY INVOKER・search_path固定で追加する。
利用者IDはauth.uid()から取得し、未認証は拒否する。各関数は本人のtime_entriesだけを変更する。
PUBLIC/anon/service_roleにはEXECUTEを付与せず、authenticatedだけに明示的に付与する。
既存のRLS・partial unique indexを維持する。

両関数は同じ利用者IDのtransaction advisory lockを取得し、開始・停止を直列化する。
ロック取得後のDB現在時刻を使用する。start_timer内の既存停止と新規INSERTは同一トランザクションで
実施し、INSERT等が失敗したら停止もロールバックする。stop_timerは実行中なしでも成功する。
アプリserviceはこのRPCを呼び、DBエラーを既存のok:falseへ変換する。UI・Server ActionのAPIは維持する。

## スコープ外

本番DBへの適用、タイマーの開始時刻編集の仕様変更、削除操作と実体化操作の同時実行の排他、
定期ルールの更新・削除全体のトランザクション化、DSTの存在しない壁時計時刻の取り扱い変更。

## テストシナリオ

- D1 [単体]: Given Asia/Tokyo・America/Los_Angeles・Pacific/Kiritimatiの週 When 初日と最終日の予定・実績を集計 Then 正しい日へ計上され全体合計と一致する。
- D2 [単体]: Given DSTの開始日を含むAmerica/New_Yorkの週 When 期間境界の実績を集計 Then 初日0時・最終日23時59分だけを含み終了日0時は除外する。
- D3 [単体]: Given 削除例外の1ページ目がエラー When 実体化 Then upsertせずルール一覧を返す。
- D4 [単体]: Given 削除例外の途中ページがエラー When 実体化 Then 部分取得結果でupsertしない。
- D5 [単体]: Given 1001件の削除例外 When 実体化 Then 2ページ目の削除例外も適用し、未削除分のみ生成する。
- D6 [単体]: Given 削除例外が取得上限超過 When 実体化 Then 一切upsertしない。
- D7 [単体]: Given 認証済みの開始/停止操作 When DB成功・失敗 Then RPCを一度呼び成功/失敗を返し、テーブルへ個別書き込みをしない。
- D8 [単体]: Given 未認証 When 開始/停止操作 Then RPCを呼ばず失敗する。
- D9 [結合]: Given 実行中タイマー When 新規INSERTがNOT NULL違反で失敗 Then 既存の開始/終了時刻は不変で実行中のまま。
- D10 [結合]: Given 同一利用者 When 8件を同時開始 Then 全操作が成功し実行中は1本、各確定区間は非負で次の開始と連続する。
- D11 [結合]: Given 実行中タイマー When 開始と停止を同時実行 Then 両方成功し実行中は最大1本、全区間は非負。
- D12 [結合]: Given 利用者A/Bと未認証/匿名クライアント When RPCを呼ぶ Then 本人だけが変更され、匿名はEXECUTE権限がなく、auth.uidなしのauthenticatedは拒否される。
- D13 [結合]: Given 新しいRPC When DBカタログを確認 Then SECURITY INVOKER/search_path固定/最小EXECUTE権限を満たす。

## 検証

担当範囲の単体テストをUTC・Pacific/Kiritimatiで実行する。ローカルSupabaseで全マイグレーションと
結合シナリオを検証する。全体check・ログ・開発計画の更新は統合担当が実施する。


## 検証記録

- 日付依存対象3ファイルを`TZ=UTC`と`TZ=Pacific/Kiritimati`で実行し、各55件合格。
- タイマーRPCサービスunit tests 4件合格。全体`npm run check`もunit 901件と本番buildまで成功。
- RPCおよび購読上限migrationの静的レビューは合格。Docker daemonが利用できず、migration reset・D9〜D13のDB結合テストは未実施。Production DBへ適用していない。
