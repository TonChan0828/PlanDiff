# 仕様書: G-113 カレンダーと計測画面で共有する操作を画面のルートから独立させる

- ステータス: 承認済み(2026-11-25)
- 関連: GitHub Issue #113(優先度P1・設計) / [G-110](G-110_内部モジュール依存とnpmパッケージの検査.md)(依存方向の検査) / [P2-2](P2-2_予定連動タイマー.md) / [P2-5](P2-5_アプリ内予定とGoogle連携凍結.md)
- 指示資料: なし(2026-11-25 に `docs/指示資料/` を確認。README のみ)

## 目的

計測画面(`components/track-view.tsx`)が `app/(app)/calendar/` 配下の Server Action を直接参照している。複数画面で使う操作の入口が、
カレンダーのルート構成に依存している。共有操作を機能単位の場所へ移し、ルートからの直接参照が再発しないよう G-110 の検査と整合させる。

## 現況(2026-11-25 実測)

`components/` から `app/` を参照しているのは次の8箇所(すべて Server Action):

| 参照先 | 参照元 | 性質 |
|---|---|---|
| `app/(app)/calendar/timer-actions.ts` | `track-view`・`calendar-view` | **共有**(カレンダーと計測の両方) |
| `app/(app)/calendar/event-actions.ts` | `track-view`(予定作成)・`calendar-view`・`plan-suggestions`・`rule-pause-review` | **共有**(計測画面が予定を作る) |
| `app/(app)/onboarding/actions.ts` | `onboarding-steps` | 画面専用(オンボーディングのみ) |
| `app/(app)/settings/actions.ts` | `delete-account-section` | 画面専用(設定のみ) |

`.dependency-cruiser.cjs` の `components-not-to-app` は、`/actions.ts` と `-actions.ts` で終わる `app` 配下のファイルを一律に許可している。
このため、共有操作を `app/(app)/calendar/` に置く現状も検査を通ってしまう。

## 仕様

### Server Action の移動(挙動は変えない)

- `app/(app)/calendar/timer-actions.ts` → `lib/timer/actions.ts`(タイマー操作。`startTimerAction` など5件)
- `app/(app)/calendar/event-actions.ts` → `lib/calendar/actions.ts`(予定・定期予定の操作。`createAppEventAction` など9件)
- ファイルの内容は変えない(`"use server"`・関数名・引数・戻り値・認証確認 → service → `revalidatePath` の順序を維持)
  - 認証がなければ `redirect("/login")`
  - 成功時のみ `revalidatePath("/calendar")` と `revalidatePath("/track")`
- 参照元(`components` の4ファイル)の import を新しい場所へ更新する。`git mv` で履歴を保つ
- 画面専用の `onboarding/actions.ts`・`settings/actions.ts` は移さない(単一の画面が所有する操作で、ルートとの対応が自然なため)

### 依存方向の検査(`.dependency-cruiser.cjs`)

- `components-not-to-app` の許可を、画面専用の2ファイルだけに絞る:
  `^app/\(app\)/onboarding/actions\.ts$` と `^app/\(app\)/settings/actions\.ts$`
  (`/actions.ts` の一律許可をやめる。共有操作が `app/` に置かれると違反になる)
- 許可の理由(画面専用で、共有されない)をルールのコメントに書く。新しい画面専用 Action を足すときは、許可の追加を仕様に含める
- フィクスチャ(`tests/fixtures/deps`)を更新: `component-to-actions`(`app/calendar/event-actions.ts`)は違反になる側へ、
  画面専用(`app/(app)/settings/actions.ts`)は許可される側として追加する

### テスト

- 既存の画面テストの `vi.mock("@/app/(app)/calendar/timer-actions" など)` のパスを新しい場所へ更新する(約15ファイル。内容は変えない)
- 現在、Server Action そのもののテストがない。移動で挙動が変わらないことを固定するため、認証・再検証のテストを新設する

## エラー時の挙動

- 変更前と同じ。移動によって失敗の扱い・戻り値は変わらない

## スコープ外

- `onboarding/actions.ts`・`settings/actions.ts`・`app/(app)/actions.ts`(ログアウト等)の移動
- Server Action の統合・分割・命名の変更、service 層(`lib/timer/service.ts` など)の変更

## テストシナリオ

- A1 [単体]: Given 未ログイン When `startTimerAction` など5件のタイマー操作を呼ぶ Then `redirect("/login")` が呼ばれ、service は呼ばれない
- A2 [単体]: Given ログイン済みで service が成功 When タイマー操作を呼ぶ Then service の結果をそのまま返し、`/calendar` と `/track` を再検証する
- A3 [単体]: Given service が失敗(`ok: false`) When タイマー操作を呼ぶ Then 再検証しない
- A4 [単体]: 予定・定期予定の操作(`createAppEventAction` ほか9件)について、A1〜A3 と同じ振る舞い(認証・成功時のみ再検証)。再検証するパスは Action ごとに違う(`disableRuleLearningAction` は `/calendar` のみ、`setRulePauseAction` は `/summary` も)ため、現行の挙動を表にして固定する
- A5 [単体・境界]: `updateRunningStartAction`・`deleteTimeEntryAction` の引数が service へそのまま渡る
- A6 [画面]: 既存の画面テスト(calendar-view / track-view / plan-suggestions / rule-pause-review ほか)が、新しいパスのモックで全件合格する
- A7 [検査]: `npm run check:deps` が合格する。`components/` から `app/(app)/calendar/` の Action を参照するフィクスチャは `components-not-to-app` で違反になる
- A8 [検査]: 画面専用(`app/(app)/settings/actions.ts`)の参照を再現したフィクスチャは許可される
- A9 [E2E・375px]: 計測画面から予定を作成してタイマーを開始・停止でき、カレンダーでも同じ操作ができる(既存の E2E を実行。移動で動線が壊れていない)
- A10 [ビルド]: `npm run build` が合格する(`"use server"` のファイルが `lib/` に置かれても、Server Action として扱われる)

## 完了条件

- #113: 共有操作が機能単位の場所にあり、計測画面がカレンダーのルートを参照しない。ルートからの直接参照が再発するとCIが失敗する
