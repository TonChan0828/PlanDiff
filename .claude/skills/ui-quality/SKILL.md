---
name: ui-quality
description: Use when building or changing ANY UI (pages, components, styles) in this repo - enforces mobile-first 375px verification, design consistency for the plan-vs-actual overlay, Japanese UI text rules, and accessibility checks. Invoke BEFORE writing UI code and use its checklist before claiming UI work done.
---

# UI品質ガイド(PlanDiff)

モバイルファースト(iPhone SE = 375px 基準)。オーバーレイ表示(予定 vs 実績)がプロダクトの「顔」であり、
UI品質への投資はそこに最優先で配分する。

## 実装ルール

- **Server Components デフォルト**。`"use client"` はタイマー操作・カレンダー操作など必要な葉に限定
- Tailwind はモバイルを基準に書き、`sm:` / `md:` で広げる(デスクトップから縮めない)
- タップターゲットは最小 44×44px(タイマー開始/停止は最重要操作)
- UIテキストは日本語。文言は分散させず定数に寄せる(`lib/` 配下の1箇所)
- 日時表示はユーザーのタイムゾーンに変換して表示(DBはUTC)。`date-fns` を使い `Date` の直接演算を避ける
- ローディングは「キャッシュ表示 → バックグラウンド同期反映」の順。スピナーで画面全体をブロックしない
- タイマー開始/停止は楽観的更新で即時反映し、失敗時に日本語エラーでロールバックする

## オーバーレイ表示のデザイン規約(FR-06)

- 予定ブロック: **左寄せ・薄い塗り**(例: 同系色の 20-30% 不透明度)
- 実績ブロック: **右寄せ・濃い塗り**。予定に紐づく実績は同系色、フリー/割り込みは別色
- 開始遅延・超過が「ズレ」として一目でわかること(色・位置だけでなく形でも伝える)
- 色だけに意味を持たせない(色覚多様性への配慮。ラベル・パターンを併用)

## アクセシビリティ最低ライン

- インタラクティブ要素はセマンティックな要素(`button` / `a`)で実装。`div onClick` 禁止
- アイコンのみのボタンには `aria-label`(日本語)
- テキストコントラスト比 4.5:1 以上

## 完了前チェックリスト(UI変更のDefinition of Done)

- [ ] **375px幅で表示崩れがないことを実際に確認した**(Playwright MCP: `browser_resize` で 375×667 → `browser_take_screenshot`。dev サーバー起動は `npm run dev`)
- [ ] タップターゲット 44px を満たす
- [ ] 文言が日本語で、ハードコードが1箇所に寄っている
- [ ] コンポーネントテスト(Testing Library)が仕様書のシナリオと対応している
- [ ] ダーク/ライトの想定があるなら両方確認(MVPはライトのみで可。その場合は明記)
