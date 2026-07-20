# 仕様書: P2-5 アプリ内予定の作成・編集・削除とGoogle連携のUI凍結

- ステータス: 承認済み(2026-07-10)
- 関連: docs/要件定義書.md の FR-10(新設)/ FR-02(凍結注記)、docs/開発計画.md P2-5
- 依存: P0-6(synced_events / time_entries)、P2-1(カレンダービュー)、P2-2(タイマー)、
  P2-4(編集パネルのUIパターン)、P1-2/P1-3(同期API・Google連携。本仕様で凍結フラグを導入)
- 指示資料: なし(docs/指示資料/ を確認済み、2026-07-10時点でREADMEのみ)

## 目的

これまで予定の供給源はGoogleカレンダー同期のみだったため、Google未連携ユーザーには
「計画→記録→ギャップ」のコアループが成立しなかった(予定レーンが常に空)。本仕様で:

1. **アプリ内で予定を作成・編集・削除できるようにする**(FR-10)。Google非依存で
   予定連動タイマー(FR-04)・オーバーレイ(FR-06)・ギャップサマリー(FR-07)まで完結させる
2. **Googleカレンダー連携のUI導線を環境フラグで凍結する**。ドメイン取得・OAuth審査の
   長期化を受けた措置。API・lib・テストは削除せず、フラグONで復活できる状態を保つ

## 仕様

### データ変更(マイグレーション。実装時は db-migration Skill に従う)

```sql
alter table public.synced_events
  add column source text not null default 'google'
  constraint synced_events_source_check check (source in ('google', 'app'));
```

- 既存行は default により `'google'` になる(後方互換。既存コードの insert/upsert は
  source未指定でも従来どおり動く)
- **アプリ予定も `synced_events` に保存する**。`source = 'app'`、
  `google_event_id = 'app:' + randomUUID()`(サーバー側で生成)。`app:` プレフィックスは
  GoogleのイベントIDと衝突しないため、unique(user_id, google_event_id)・
  time_entries との紐づけ(google_event_id 文字列)・タイマー/オーバーレイ/サマリーの
  既存ロジックがそのまま機能する
- `synced_at` はアプリ予定では「作成/更新時刻」の意味になる(挙動には影響しない)
- RLS・GRANTは変更なし(既存の own-row CRUD ポリシーでアプリ予定の書き込みが可能)
- 新規インデックスなし(source 単独で絞る高頻度クエリはない)

### アプリ予定のCRUD(Server Action + ロジック層)

- ロジック: `lib/calendar/app-events.ts`(`lib/timer/service.ts` のパターンを踏襲。
  SupabaseClient を受け取り `{ ok: boolean }` を返す)
- Server Action: `app/(app)/calendar/event-actions.ts`
  (`timer-actions.ts` と同様に認証済みRLSクライアントで実行)

| 関数 | 入力 | 挙動 |
|---|---|---|
| `createAppEvent` | title, startAt, endAt(UTC ISO) | バリデーション後、`source='app'`・`google_event_id='app:'+uuid` で insert |
| `updateAppEvent` | id, title, startAt, endAt | `.eq("source", "app")` ガード付き update。google_event_id は変更しない |
| `deleteAppEvent` | id | `.eq("source", "app")` ガード付き delete |

- サーバー側バリデーション(不合格は `{ ok: false }`、行を書き込まない):
  - title: trim後1文字以上200文字以下
  - startAt / endAt: 妥当なISO文字列かつ **startAt < endAt**(同時刻は不可。
    ゼロ長の予定は計画として意味を持たないため)
- **Google由来の予定(source='google')は従来どおり読み取り専用**。update/delete の
  sourceガードにより、IDを直接指定されても書き換え不可
- アプリ予定を削除しても、紐づく `time_entries` は削除しない(google_event_id の
  スナップショットが残り、サマリー上は「割り込み実績」扱いになる。Google側で予定が
  消えた場合の既存挙動と同一)
- 実行中タイマーが紐づく予定を編集・削除しても、タイマーには影響しない
  (time_entries は title / google_event_id をスナップショットとして保持している)

### 同期APIのアプリ予定保護(必須)

`app/api/calendar/sync/route.ts` の「期間内でGoogle側から消えた予定の削除」
(stale削除)クエリに `.eq("source", "google")` を追加する。
**現状のままだとアプリ予定はGoogleレスポンスに存在しないため、同期のたびに削除される。**
最終レスポンスのselectは変更しない(アプリ予定も含めて返る=表示の一貫性)。

### UI(実装時は ui-quality Skill・375px確認)

新コンポーネント `components/app-event-panel.tsx`(`edit-entry-panel.tsx` のパターンを踏襲):

- モーダルパネル(role="dialog")。作成モード/編集モードを持つ
- フィールド: タイトル(text)、開始(`DateTimeStepper`。P5-5)、終了(`DateTimeStepper`。P5-5)。
  端末ローカルTZで表示し、保存時にUTC ISOへ変換(P2-4と同じ方式)
- 作成モードの初期値: 選択中の日付の「次の正時から1時間」(例: 14:23に開くと15:00〜16:00)
- クライアント側バリデーション(フォーム内エラー表示、Server Actionを呼ばない):
  タイトル空(trim後)/日時未入力/終了 ≤ 開始
- 編集モードには削除ボタン。削除は確認ステップ(「削除しますか?」)を挟む(P2-4と同一UX)
- pending中は閉じる・再送信を抑止。Server Action失敗時は日本語エラーをパネル内表示

`components/calendar-view.tsx`:

- ヘッダー操作列に「+ 予定を追加」ボタンを追加 → 作成モードでパネルを開く。
  保存成功で `router.refresh()`(楽観的更新はしない。P2-4と同じ方針)
- 予定ブロック(`source='app'` のみ)の右上に**編集ボタンを兄弟要素として重ねる**
  (ブロック本体はタイマー開始/停止ボタンのままのため、button入れ子を避ける)。
  aria-label「◯◯の予定を編集」、最小タップ領域を確保。タップで編集モードのパネルを開く
- `source='google'` のブロックには編集ボタンを表示しない
- 予定・実績ゼロ時の空メッセージに「+ 予定を追加」への誘導文言を追加する
- `CalendarViewEvent` / `lib/calendar/events.ts` の `SyncedEvent` に `source` を追加
  (`fetchSyncedEvents` のselectに source を含める)

### Google連携のUI凍結(環境フラグ)

- サーバー専用env **`GOOGLE_INTEGRATION_ENABLED`**。`"true"` のときのみ有効。
  **未設定・それ以外の値は無効(凍結)= デフォルト凍結**
- 判定ヘルパー: `lib/google/integration-flag.ts` の `isGoogleIntegrationEnabled()`。
  クライアントには Server Component から props で渡す(クライアントバンドルにenvを埋め込まない)

| 箇所 | フラグOFF(凍結)時の挙動 |
|---|---|
| `/settings` | Google連携セクションを表示しない(`getGoogleRefreshToken` も呼ばない) |
| `/calendar`(page) | `getGoogleRefreshToken` を呼ばず `googleEnabled=false` を渡す |
| `CalendarView` | マウント時/週変更時の `/api/calendar/sync` fetchを発火しない(syncing初期値もfalse)。「更新」ボタン非表示。`GoogleConnectionBanner` を表示しない |
| `/api/calendar/sync` | 404 を返す |
| `/api/google/connect` / `/api/google/callback` | 404 を返す |

- コード・既存テストは削除しない。フラグ依存のテストはテスト内でフラグ値を注入する
- 凍結中、過去に同期済みの `source='google'` キャッシュ行は**表示のみ継続**する
  (削除も再同期もしない。凍結解除時に通常の同期で最新化される)
- `google_tokens` の行も削除しない(凍結解除で連携が復活する)

### エラー時の挙動一覧(すべて日本語)

| ケース | 表示 |
|---|---|
| 作成/編集: タイトル空 | フォーム内「タイトルを入力してください」 |
| 作成/編集: 日時未入力 | フォーム内「開始と終了の日時を入力してください」(P2-4文言を流用) |
| 作成/編集: 終了 ≤ 開始 | フォーム内「終了時刻は開始時刻より後にしてください」(P2-4文言を流用) |
| 作成 Server Action 失敗 | パネル内「予定の作成に失敗しました」 |
| 編集 Server Action 失敗 | パネル内「予定の更新に失敗しました」 |
| 削除 Server Action 失敗 | パネル内「予定の削除に失敗しました」 |

文言は `lib/calendar/messages.ts` に集約する(i18n方針)。

### セキュリティ(CLAUDE.md「やってはいけないこと」の再確認)

- アプリ予定の書き込みはユーザー本人のRLSクライアントのみ(service role不使用)
- sourceガードにより読み取り専用データ(Googleキャッシュ)の改変を防ぐ
- `GOOGLE_INTEGRATION_ENABLED` はサーバー専用env。クライアントへはbooleanのpropsとしてのみ渡す

## スコープ外

- 繰り返し予定・終日予定・複数日にまたがる予定の専用UI(`DateTimeStepper`の日付入力で日またぎ入力自体は可能)
- 予定のドラッグ&ドロップ移動・リサイズ
- Googleカレンダーへの書き戻し(v2以降・人間が判断。CLAUDE.md)
- Google連携コード(API・lib・テスト)の削除(凍結のみ。復活はフラグONで行う)
- アプリ予定とGoogle予定の重複検出・マージ
- `synced_events` テーブルのリネーム(将来の課題として記録のみ)

## テストシナリオ

### 単体(app-event-panel / calendar-view)

- S1 [単体] 正常系: Given 作成パネルでタイトル・開始・終了を入力 When 保存 Then
  createAppEventAction がUTC ISOで呼ばれ、成功後にパネルが閉じ refresh される
- S2 [単体] 異常系: Given タイトルが空白のみ When 保存 Then アクションを呼ばず
  フォーム内エラーを表示する
- S3 [単体] 境界値: Given 終了=開始 When 保存 Then フォーム内エラー。
  終了=開始+1分なら送信される
- S4 [単体] 正常系: Given `source='app'` の予定ブロック When 描画 Then 編集ボタンが
  表示され、タップで編集モードのパネルが初期値付きで開く
- S5 [単体] 正常系: Given `source='google'` の予定ブロック When 描画 Then
  編集ボタンは表示されない(タイマー開始/停止のタップは従来どおり動作)
- S6 [単体] 正常系: Given 編集パネルで削除ボタン When タップ Then 確認ステップを経て
  deleteAppEventAction が呼ばれる
- S7 [単体] 正常系: Given アプリ予定ブロック(googleEventId='app:...') When タップ Then
  既存のタイマー開始が googleEventId 付きで呼ばれる(予定連動タイマーの互換)
- S8 [単体] 正常系: Given 表示範囲に予定・実績ゼロ When 描画 Then 空メッセージに
  「予定を追加」への誘導文言が含まれる

### 単体(サマリー集計の app: キー互換)

- S9 [単体] 正常系: Given `googleEventId='app:xxx'` の予定と同キーの実績 When
  computeGapSummary Then linked として集計される(割り込み扱いにならない)
- S10 [単体] 正常系: Given 実績の googleEventId='app:xxx' に対応する予定が存在しない
  (削除後を想定) When computeGapSummary Then 割り込み実績として集計される

### 結合(app-events CRUD。ローカルSupabase)

- S11 [結合] 正常系: Given ログインユーザー When createAppEvent Then `synced_events` に
  `source='app'`・`google_event_id` が `app:` 始まりの行が作成される
- S12 [結合] 異常系: Given startAt >= endAt の入力 When createAppEvent Then
  行が作成されず `{ ok: false }` が返る(サーバー側バリデーション)
- S13 [結合] 正常系: Given 自分の `source='app'` 行 When updateAppEvent Then
  タイトル・開始/終了が更新され、google_event_id は変わらない
- S14 [結合] 異常系: Given `source='google'` の行のid When updateAppEvent /
  deleteAppEvent Then 行は変更・削除されず `{ ok: false }` が返る(sourceガード)
- S15 [結合] 正常系: Given アプリ予定に紐づく time_entries がある状態 When
  deleteAppEvent Then 予定行は削除され、time_entries は google_event_id を保持したまま残る

### 結合(同期のアプリ予定保護)

- S16 [結合] 正常系: Given 期間内に `source='app'` 行と、Googleレスポンスに存在しない
  `source='google'` 行がある When `/api/calendar/sync`(フラグON・トークン交換モック)
  Then google側のstale行のみ削除され、`source='app'` 行は残り、レスポンスにも含まれる

### 単体/結合(Google凍結フラグ)

- S17 [単体] 正常系: Given フラグOFF When `/settings` を描画 Then Google連携セクションが
  表示されない。フラグONなら従来どおり表示される
- S18 [単体] 正常系: Given `googleEnabled=false`(props) When CalendarView をマウント
  Then `/api/calendar/sync` へのfetchが発火せず、「更新」ボタン・GoogleConnectionBanner が
  表示されない(予定ブロック・タイマー・追加ボタンは動作する)
- S19 [単体] 正常系: Given `googleEnabled=true` When CalendarView をマウント Then
  従来どおり同期fetchが発火し「更新」ボタンが表示される(リグレッション防止)
- S20 [結合] 異常系: Given フラグOFF When `/api/calendar/sync` / `/api/google/connect` /
  `/api/google/callback` を呼ぶ Then 404 が返り、DBに変更がない

### 手動疎通確認(自動テストの補完。DoDに含める)

- M1: 375pxで「+ 予定を追加」→ 予定ブロック表示 → タップでタイマー開始/停止 →
  オーバーレイ(ズレ表示)→ サマリーに linked として反映される一連を確認
- M2: アプリ予定の編集(時刻変更がブロックに反映)・削除(実績が残り割り込み表示に変わる)を確認
- M3: フラグ未設定(凍結)で `/settings`・`/calendar` にGoogle導線が一切見えないこと、
  `GOOGLE_INTEGRATION_ENABLED=true` でGoogle連携UI・同期が従来どおり動くことをローカルで確認
