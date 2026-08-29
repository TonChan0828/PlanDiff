# 仕様書: D-6 Structured テーマの追加

- ステータス: 承認済み(2026-08-29)
- 関連: [docs/specs/D-1-2_デザイン刷新.md](D-1-2_デザイン刷新.md) の §D-1a(トークン体系)・§D-1e(テーマの手動切替) /
  docs/要件定義書.md の FR-06(オーバーレイ表示) /
  参考サイト: https://structured.app/ (2026-08-29 ユーザー指定) /
  docs/指示資料: 該当なし(2026-08-29時点。README.md のみで実資料なし)
- 前提: **機能・データ・APIは一切変更しない**。デザイントークン層と、そこへ至る
  間接参照の追加のみを対象とする

## 目的

ユーザーが https://structured.app/ を参考にしたテーマを作りたいと要望した(2026-08-29)。

D-1e で `<html data-theme>` + localStorage によるテーマ切替機構は完成しており、色は
`app/globals.css` の17個のCSS変数に一元化済み。本タスクはその機構に4つ目の選択肢
`structured` を足し、**暖色系の別人格でもオーバーレイUIが成立すること**を実証する。

副次的な目的として、これまで色だけだったテーマの守備範囲を**角丸とフォントファミリーへ拡張**し、
「テーマ = トークンのみ。コンポーネントは分岐させない」という既存アーキテクチャを保ったまま
見た目を大きく変えられる基盤を作る。

## 参考サイトから実測したデザイン言語

ブラウザ(Claude in Chrome)で `getComputedStyle` により計測した実値:

| 項目 | 実測値 |
| --- | --- |
| 背景 | `rgb(255,167,160)` = `#FFA7A0`(ヒーロー)、下層セクションは淡い `#F8DDD9` |
| アクション色 | `rgb(97,133,168)` = `#6185A8`(スレートブルー) |
| 深部 | `rgb(44,80,115)` = `#2C5073`(ネイビー) |
| カード | `#FFFFFF` |
| フォント | `Inter, "Inter Fallback", Inter, system-ui, sans-serif` の一本 |
| 角丸 | ボタン・ナビ `100px`(完全なピル)、カード `32–40px`、細部 `4px` |
| 罫線 | ほぼ使わず、面と余白で区切る |

## 仕様

### 1. テーマ軸の拡張

`data-theme` の取りうる値に `structured` を追加する。軸は分割しない(1軸拡張)。

```
data-theme = "light" | "dark" | "structured" | (属性なし = system)
```

- `lib/theme/theme.ts` の `THEME_PREFERENCES` に `"structured"` を追加する
- `resolveThemeAttribute()` は `"structured"` をそのまま属性値として返す。
  `system`・不正値・未保存は従来どおり `null`(属性なし)
- `resolveThemePreference()` は `"structured"` をそのまま返す。不正値は `"system"`
- `THEME_INIT_SCRIPT`(FOUC防止の同期スクリプト)も `structured` を受け付ける。
  値の判定は列挙をハードコードせず `THEME_PREFERENCES` から組み立て、将来テーマを
  足したときに片方だけ直し忘れる事故を防ぐ
- 保存先は **localStorage のみ**(既存のまま)。Cookie は追加しない。
  `THEME_INIT_SCRIPT` が既に初回描画前に属性を付けており、真実の情報源を2つにしない
- Structured は **ライト固定**(ダーク版は作らない)。`color-scheme: light` を指定し、
  スクロールバー・フォーム部品を明色に固定する

### 2. 設定画面

- `lib/settings/messages.ts` に `themeStructured: "Structured"` を追加する
- `components/theme-selector.tsx` の `OPTIONS` に4つ目を追加する。
  並びは ライト / ダーク / システムに合わせる / Structured
- ロジックは変更しない(`useSyncExternalStore` の購読・別タブ同期はそのまま)

### 3. カラートークン

`app/globals.css` に `:root[data-theme="structured"]` ブロックを新設し、
`:root` が定義する全17変数を再定義する。コンポーネントは全て `bg-brand` 等の
トークンクラス経由のため**変更不要**。`app/(marketing)/page.tsx` の LP ミニチュア
オーバーレイ(calendar-view とは別実装)も同じトークンを使うため自動追随する。

| トークン | 値 | 意図 |
| --- | --- | --- |
| `--paper` | `#faeae7` | 淡いコーラル(参考サイトの下層セクションを常用向けに明るく) |
| `--surface` | `#ffffff` | 白カード |
| `--ink` | `#2a2320` | 暖かい近黒 |
| `--ink-muted` | `#665754` | 暖かいグレー |
| `--line` | `#edd9d5` | コーラル寄りの罫線 |
| `--brand` | `#35597d` | スレートブルー(下記の理由で参考値より暗くする) |
| `--brand-ink` | `#ffffff` | |
| `--plan-fill` | `rgba(53,89,125,0.12)` | 予定 = 薄い塗り |
| `--plan-border` | `rgba(53,89,125,0.4)` | |
| `--plan-text` | `#2c5073` | 参考サイトのネイビー |
| `--interrupt` | `#b4551f` | テラコッタ。コーラル背景上で `--danger` と分離させる |
| `--danger` | `#b3261e` | |
| `--success` | `#2a6b4f` | |
| `--hatch` | `rgba(180,85,31,0.5)` | ズレの斜線(`--interrupt` の50%) |
| `--grid` | `rgba(42,35,32,0.045)` | 方眼を弱める(参考サイトは罫線を使わない) |
| `--grid-hour` | `rgba(42,35,32,0.1)` | |
| `--focus` | `#35597d` | |

**参考値をそのまま使わない理由**: 参考サイトのアクション色 `#6185A8` は白文字との
コントラストが約 3.5:1 で WCAG AA(4.5:1)を満たさない。参考サイトでは主にピル型
ボタンの背景として使われるが、PlanDiff の `--brand` は**実績ブロックのベタ塗り**でもあり、
その上に必ず `--brand-ink`(白)のテキストが乗る(`calendar-view.tsx` の `ActualBlock`)。
そのため暗い方向へ寄せた `#35597d` を採用する。色の値ではなく
**「暖色の面 × 寒色のアクション」という役割関係**を継承する。

上表は出発点であり、S12(コントラスト検証)が通る値へ実装時に調整してよい。

### 4. 角丸(シェイプ)

`rounded-lg` はコードベース内で121箇所(39ファイル)に散っている。個別置換ではなく、
Tailwind v4 の `--radius-*` 名前空間を `@theme inline` で CSS 変数に委譲する。
**コンポーネントの変更ゼロ**で121箇所が同時にテーマ追随する。

```css
:root {
  /* Tailwind v4 の既定値と同一 = 既存テーマの見た目は変わらない */
  --r-xs: 0.125rem; --r-md: 0.375rem; --r-lg: 0.5rem; --r-xl: 0.75rem;
  --r-control: 0.5rem;    /* = --r-lg */
  --r-control-lg: 0.75rem; /* = --r-xl */
}
:root[data-theme="structured"] {
  --r-xs: 0.25rem; --r-md: 0.625rem; --r-lg: 0.875rem; --r-xl: 1.5rem;
  --r-control: 999px;
  --r-control-lg: 999px;
}
@theme inline {
  --radius-xs: var(--r-xs);
  --radius-md: var(--r-md);
  --radius-lg: var(--r-lg);
  --radius-xl: var(--r-xl);
  --radius-control: var(--r-control);       /* 新設: 操作部品(小) */
  --radius-control-lg: var(--r-control-lg); /* 新設: 操作部品(大) */
}
```

対象は実際に使われている `rounded-xs` / `rounded-md` / `rounded-lg` / `rounded-xl`
(および `rounded-t-*` / `rounded-b-*` の派生)。`rounded-full` は元から完全な丸なので触らない。

**ピル型ボタン**: 新設の `rounded-control` 系へ移すのは**押せるボタンだけ**。
本リポジトリにはボタンの規約が2つあり、それぞれ元の角丸が違うため**トークンも2つに分ける**
(1つに寄せると既存テーマの見た目が変わってしまう):

| 規約 | 判別条件 | 元のクラス | 移行先 | 箇所数 |
| --- | --- | --- | --- | --- |
| 小さめボタン | `min-h-11` + `inline-flex` + `justify-center` | `rounded-lg`(0.5rem) | `rounded-control` | 44 |
| 大きめCTA | `min-h-12` + `inline-flex` + `items-center` | `rounded-xl`(0.75rem) | `rounded-control-lg` | 11 |

`calendar-view.tsx` の実績ブロック、`summary-*-chart.tsx` の棒グラフ、
`(marketing)/page.tsx` の 10×10 装飾バッジ、`free-timer-bar` / `running-timer-bar` の
スティッキーバー容器は**ボタンではないので除外**する。
既存テーマでは `--r-control` = `--r-lg`、`--r-control-lg` = `--r-xl` なので、
この移行による**既存テーマの見た目の変化はない**(S16で検証)。

### 5. フォントファミリー

`--font-sans` は現在 `@theme inline` で `var(--font-geist-sans)` に直結し、
`body` も `var(--font-geist-sans)` を直書きしている。1段の間接参照を挟む。

```css
:root { --app-font-sans: var(--font-geist-sans); }
:root[data-theme="structured"] { --app-font-sans: var(--font-inter); }
@theme inline { --font-sans: var(--app-font-sans); }
body { font-family: var(--app-font-sans), "Hiragino Sans", "Noto Sans JP", sans-serif; }
```

`app/layout.tsx` で `next/font/google` の `Inter` を `--font-inter` として読み込み、
`<html className>` に変数を追加する。`--font-mono`(Geist Mono。時刻・数値の
`font-mono tabular-nums` 用)は据え置き。

### 6. タイムラインの見た目

`calendar-view.tsx` の構造(左55% 予定レーン / 右45% 実績レーン、時刻レール、
ハッチ、現在時刻線)は**プロダクトの価値そのものなのでテーマで変えない**。

参考サイトの「淡色背景の上の白カード」という印象は、`--paper`(コーラル) /
`--surface`(白) / `--grid`(方眼をほぼ消す) / 角丸拡大の組み合わせで表現する。
**構造を分岐させるコンポーネント改修は行わない**。

## スコープ外

- **`viewport.themeColor` / `app/icon.svg` の `data-theme` 追随** —
  どちらも `prefers-color-scheme` ベースで `data-theme` に反応しない既知のギャップ。
  Structured 選択時もブラウザUI色・アイコンは群青のまま。meta タグの動的更新が必要で
  本タスクの射程を超えるため、`docs/開発計画.md` に別項目(D-7)として記録するに留める
- **ダークトークンの2箇所重複の解消**(`@media (prefers-color-scheme: dark)` と
  `[data-theme="dark"]`) — 既知の負債。Structured を足しても重複は増えないので触らない
- **Structured のダーク版** — ラインナップは「現行(ライト/ダーク/システム) + Structured」の構成とする
- **見出しスケール・字面の組版変更** — 参考サイトの「大きく軽い小文字見出し + 強調語だけ bold」は
  コンポーネント側の話。テーマでフォントスケールを変えると375pxのレイアウトが全て
  再検証対象になるため、今回はファミリー差し替えまで
- **円形アイコンバッジ・丸チェックボックス等のタイムライン構造の再現** — §6 の理由
- **Cookie によるサーバー側反映** — §1 の理由

## テストシナリオ

### 単体: テーマ解決ロジック(`tests/lib/theme/theme.test.ts` に追記)

- **S1** [単体]: Given 保存値 `"structured"` / When `resolveThemeAttribute` / Then `"structured"` を返す
- **S2** [単体]: Given 保存値 `"structured"` / When `resolveThemePreference` / Then `"structured"` を返す
- **S3** [単体・境界値]: Given `"system"` / `"blue"` / `""` / `null` / When `resolveThemeAttribute` /
  Then すべて `null`(属性なし)を返す(既存S13の回帰)
- **S4** [単体]: Given localStorage に `"structured"` / When `THEME_INIT_SCRIPT` を実行 /
  Then `document.documentElement.dataset.theme === "structured"`
- **S5** [単体・異常系]: Given localStorage に不正値 `"blue"` / When `THEME_INIT_SCRIPT` を実行 /
  Then 属性を設定しない(既存S13の回帰)
- **S6** [単体・異常系]: Given `Storage.prototype.getItem` が例外を投げる /
  When `THEME_INIT_SCRIPT` を実行 / Then 例外を投げずシステム追随になる(既存S13の回帰)
- **S7** [単体]: Given 任意の状態 / When `applyThemePreference("structured")` /
  Then DOM 属性が `"structured"` になり localStorage にも `"structured"` が保存される
- **S8** [単体・境界値]: Given `THEME_PREFERENCES` の各値 / When `THEME_INIT_SCRIPT` で順に検証 /
  Then `system` 以外のすべてが属性として設定される(定義とスクリプトの乖離検出)

### 結合: 設定画面のコンポーネント(`tests/components/theme-selector.test.tsx` に追記・更新)

- **S9** [結合]: Given 保存値なし / When ThemeSelector を描画 /
  Then **4つ**のラジオが表示され「システムに合わせる」が選択済み(既存S10を3択→4択に更新)
- **S10** [結合]: Given ThemeSelector を描画 / When「Structured」をクリック /
  Then `data-theme="structured"` かつ localStorage に `"structured"` が保存され、当該ラジオが選択済みになる
- **S11** [結合]: Given localStorage に `"structured"` / When ThemeSelector を描画 /
  Then「Structured」が選択済みで復元される

### 単体: デザイントークン規約(新規 `tests/lib/design/theme-tokens.test.ts`)

`app/globals.css` をテキストとして読み、正規表現でトークンを抽出する静的テスト。
既存 `tests/lib/design/no-raw-colors.test.ts` と同じ「規約を実行可能にする」流儀。

- **S12** [単体]: Given `globals.css` / When `:root` と `[data-theme="structured"]` の
  変数定義を比較 / Then `:root` が定義する全カスタムプロパティを Structured も定義している
  (定義漏れの検出。漏れた変数名を差分として報告する)
- **S13** [単体]: Given `globals.css` / When `[data-theme="dark"]` と `@media (prefers-color-scheme: dark)`
  の変数定義を比較 / Then 両者が完全に一致する(既知の二重管理の回帰防止)
- **S14** [単体・境界値]: Given Structured の色トークン / When 下記の前景/背景の組み合わせで
  コントラスト比を計算 / Then すべて WCAG AA(4.5:1)以上
  - `--ink` / `--paper`、`--ink` / `--surface`、`--ink-muted` / `--paper`、`--ink-muted` / `--surface`
  - `--brand-ink` / `--brand`、`--brand-ink` / `--interrupt`、`--brand-ink` / `--danger`
  - `--plan-text` / `--surface`、`--plan-text` / `--paper`
- **S15** [単体]: Given `globals.css` / When `@theme inline` の定義を検査 /
  Then `--radius-*`(`--radius-control` / `--radius-control-lg` を含む)と `--font-sans` が
  生の値ではなく `var(--...)` の間接参照になっている(テーマから外れた直書きの回帰防止)
- **S16** [単体・境界値]: Given `:root` の `--r-*` / When Tailwind v4 の既定値と比較 /
  Then 一致する。さらに `--r-control` = `--r-lg`、`--r-control-lg` = `--r-xl` であること
  (ボタンを `rounded-control` 系へ移しても既存テーマの角丸が変わっていない保証)

### 既存テストの回帰

- **S17** [単体]: `tests/lib/design/no-raw-colors.test.ts` が引き続き合格すること
  (直書きカラークラス・`dark:` バリアントの混入なし)

### 手動検証(自動テスト対象外)

`ui-quality` Skill の Definition of Done に従い、Playwright MCP で実施する。

- **M1**: 375×667 と 1280px を、**ライト / ダーク / Structured の3テーマ**で確認。
  対象ページ: `/calendar`(オーバーレイ・ハッチ・現在時刻線・方眼)、`/summary`(diffヒーロー・棒グラフ)、
  `/settings`(外観の4択)、`/`(LPのミニチュアオーバーレイ)、`/login`(フォームとピルボタン)
- **M2**: FOUC 確認。Structured 選択後にハードリロードし、初回描画からコーラル背景であること
- **M3**: 別タブ同期。2タブ開いて片方でテーマを変え、もう片方が `storage` イベントで追随すること

### R-1(日時・TZ)の適用

本タスクは日時ロジックを含まないため R-1 の対象外。

## 完了の定義

1. `npm run check`(typecheck + lint + test + build)が通り、出力を実際に確認済み
2. S1〜S17 のすべてに対応するテストが存在し、全件合格(skip・コメントアウトによる減算は禁止)
3. M1〜M3 を実施済み
4. `docs/logs/2026-08-29.md` に記録済み、`docs/開発計画.md` の状態を更新済み
