# 仕様書: P8-3 サマリーの日付またぎとTZ非対称の是正

- ステータス: 承認済み(2026-08-12)
- 関連: docs/要件定義書.md の FR-07(ギャップサマリー)/
  docs/specs/P8-1_日付またぎの自動反映.md・docs/specs/P8-2_計測画面の日付またぎ.md(同種の調査から分離)
- 指示資料: なし(`docs/指示資料/` に本件に関する資料なし。2026-08-11 確認)
- 発生元: `docs/開発計画.md` P8-3(P8-1 の調査時に発見・分離)

## 目的

`/summary` の「今日」判定・期間境界が**サーバープロセスのタイムゾーン**で計算されており、
訪問者の実際のタイムゾーンとズレうる問題を解消する。あわせて、ユーザー承認済みのスコープに従い
「ページを開き直せば常に正しい」状態にする(カレンダー/計測のような、開いたまま0時をまたいだ
瞬間に自動で切り替わるライブ追従は今回のスコープに含めない)。

### 原因

`app/(app)/summary/page.tsx:90` の `const now = new Date();` は**サーバーの実行環境のTZ**で
評価される。`resolveSummaryRange`(`lib/summary/range.ts`)はこの `now` を `startOfDay` して
「今日」を決めるため、サーバーのTZと訪問者の実際のTZが異なる地域だと、日付境界がずれる
(例: サーバーがUTCで訪問者がJSTの場合、JSTでは同日でもUTCでは前日/翌日になりうる時間帯が存在する)。

`/calendar`(`CalendarView`)・`/track`(`TrackView`)は P8-1・P8-2 でクライアント側の
`useNowMinuteMs()`(ブラウザのTZで評価される `new Date()`)を「今日」の基準にしており、
この非対称性は `/summary` だけに残っている。

**サーバー(Server Component)は訪問者のTZを知る手段を一切持たない**。`Intl.DateTimeFormat` は
クライアントでしか実行環境のTZを取得できず、リクエストヘッダーにも訪問者のTZは含まれない。

## 仕様

### 全体設計

1. クライアントが初回描画後に `Intl.DateTimeFormat().resolvedOptions().timeZone` を読み、
   Cookieへ保存する(訪問者のTZをサーバーに伝える唯一の手段)
2. サーバー(`/summary` の Server Component)はこのCookieを読み、値があれば
   `@date-fns/tz` の `TZDate`(このリポジトリで `lib/calendar/recurring.ts` /
   `lib/calendar/suggestions.ts` が既に使っている型)でそのタイムゾーンの `now` を組み立てる。
   値がなければ従来どおり `new Date()`(サーバーTZ)にフォールバックする
3. `date-fns` v4 + `@date-fns/tz` は `TZDate` を渡すと `startOfDay` / `startOfWeek` /
   `addWeeks` / `startOfMonth` / `addMonths` / `addDays` / `parse` のいずれもタイムゾーンを
   保持したまま計算する(プロセスの `TZ` 環境変数に依存しないことを検証済み)。既存の
   `resolveSummaryRange` のロジック自体は変更せず、渡す `now` を差し替えるだけで成立する

### 1. `lib/time/now-in-timezone.ts`(新規・純粋関数)

```ts
export function resolveNowInTimezone(
  timezone: string | null,
  base: Date = new Date(),
): Date
```

- `timezone` が `null` なら `base` をそのまま返す(現状維持)
- 有効なIANAタイムゾーン名なら、`base` の時刻を保持したまま `new TZDate(base, timezone)` を返す
- 存在しないタイムゾーン名(`TZDate` が例外を投げる場合)は `base` にフォールバックする
  (不正なCookie値でSSRを落とさない)

### 2. `lib/time/timezone-cookie.ts`(新規)

```ts
export const TIMEZONE_COOKIE_NAME = "plandiff-tz";
export function isValidTimezoneValue(value: string): boolean;
export async function readTimezoneCookie(): Promise<string | null>; // next/headers の cookies() を使用
```

- Cookie値は許可文字集合(`/^[A-Za-z0-9_+\-/]{1,64}$/`。IANA名の形式)で軽く検証してから返す。
  形式チェックを通っても実在しないタイムゾーン名の可能性はあるため、最終防御は
  `resolveNowInTimezone` 側の try/catch で行う(多層防御)

### 3. `components/timezone-sync.tsx`(新規・`"use client"`、非表示の葉コンポーネント)

- マウント時に `Intl.DateTimeFormat().resolvedOptions().timeZone` を読む
- 既存のCookie値と一致していれば何もしない(**Cookie書き込み・`router.refresh()` は行わない**。
  値が変わらないのに毎回書き込むと、サーバーレンダリングのたびにrefreshが走るループになるため)
- 一致しなければ(未設定 or 端末のTZが変わった)Cookieへ書き込み、`router.refresh()` を1回呼ぶ
- 何も描画しない(`return null`)
- `app/(app)/layout.tsx` に1つだけ配置する(認証済み画面全体に効く。`/summary` だけでなく
  `/calendar` `/track` の週バッファ計算にも副次的に効くが、両画面は既にクライアント側で
  「今日」を判定しているため実害はなく、害はない)

### 4. `lib/calendar/view-date.ts` の `parseDateParam` を拡張

```ts
export function parseDateParam(
  dateParam: string | undefined,
  referenceZero: Date = new Date(0),
): Date | null
```

- 第2引数はデフォルト `new Date(0)` で**後方互換**(既存の全呼び出し元は単一引数のまま
  今までどおり動く。`/calendar` 側の挙動・テストへの影響はない)
- `/summary` から `TZDate(0, timezone)` を渡すことで、`date=YYYY-MM-DD` 形式のURLパラメータも
  訪問者のタイムゾーンの暦日として解釈できるようにする

### 5. `lib/summary/range.ts` の `resolveSummaryRange` 内部実装を変更(シグネチャは不変)

- `now instanceof TZDate` なら `new TZDate(0, now.timeZone)` を、そうでなければ
  `new Date(0)` を「基準ゼロ時刻」として `parseDateParam(params.date/from/to, referenceZero)`
  に渡す
- 呼び出し側(`page.tsx`)のシグネチャ `resolveSummaryRange(params, now)` は変わらない。
  `now` に `TZDate` を渡すか通常の `Date` を渡すかで内部の解釈が切り替わる

### 6. `app/(app)/summary/page.tsx` の変更

```ts
const timezone = await readTimezoneCookie();
const now = resolveNowInTimezone(timezone);
```

## スコープ外

- **開いたまま0時をまたいだときのライブ自動切り替え**(P8-1/P8-2 のような `router.refresh()`
  ポーリング)。ユーザー承認により「開き直せば正しい」で十分とする
- **`buildSummaryPath` の「今日は `date` を付けない」不変条件**(P8-1 の `buildCalendarPath` と
  同種の対応)。`/summary` への主要な導線(下部タブ/デスクトップナビ)は元々パラメータなしの
  `/summary` を指しており都度「今日」に解決されるため実害は限定的。ページ内の期間タブ・前後
  移動リンクに `date` が焼き込まれる点は残るが、影響が限定的かつ本件のTZ是正と独立した論点の
  ため、必要になった時点で別項目として起票する
- サーバーのTZそのものの変更(Vercelのリージョン設定等)
- ユーザーがアプリ内でタイムゾーンを明示的に選択・上書きする設定機能

## 影響する既存テスト(仕様変更に伴う更新であり、無効化ではない)

- `tests/app/(app)/summary/page.test.tsx` / `page-range.test.tsx` / `page-counts.test.tsx` /
  `page-row-limit.test.tsx` / `page-charts.test.tsx`: いずれも `SummaryPage` を直接レンダーして
  おり、`readTimezoneCookie`(`next/headers` の `cookies()` を呼ぶ)が実リクエストスコープ外で
  例外になるため、既存の他モジュールモックと同じパターンで
  `vi.mock("@/lib/time/timezone-cookie", () => ({ readTimezoneCookie: vi.fn().mockResolvedValue(null) }))`
  を追加する(Cookieなし=サーバーTZ基準という現状の既存テストの前提と一致させる)
- `tests/app/(app)/layout.test.tsx`: `<TimezoneSync />` が `useRouter()` に依存するため、
  既存の `next/navigation` モックに `useRouter: () => ({ refresh: vi.fn() })` を追加する

## テストシナリオ

### `resolveNowInTimezone`(`tests/lib/time/now-in-timezone.test.ts`)

- S1 [単体]: Given `timezone` が `null` Then `base` をそのまま返す(現状維持)
- S2 [単体]: Given 有効なIANA名(例 `"Pacific/Kiritimati"`)と `base` Then 同じ時刻を保持した
  `TZDate` を返し、`startOfDay` した結果がそのタイムゾーンの日境界になる。プロセスの `TZ`
  環境変数を変えても結果が変わらないこと(サーバーTZに依存しないことの回帰確認)
- S3 [単体・異常系]: Given 実在しないタイムゾーン名 Then 例外を投げず `base` にフォールバックする

### `timezone-cookie`(`tests/lib/time/timezone-cookie.test.ts`。`next/headers` をモック)

- S4 [単体]: Given Cookie未設定 Then `null` を返す
- S5 [単体]: Given 妥当なIANA形式のCookie値 Then その値を返す
- S6 [単体・境界値]: Given 許可文字集合外・65文字以上のCookie値 Then `null` を返す
  (不正値でSSRを落とさない)

### `parseDateParam` 拡張(`tests/lib/calendar/view-date.test.ts`)

- S7 [単体]: Given 第2引数を省略 Then 既存どおりの解釈になる(回帰確認。既存シナリオ
  S1〜S11 が無改修で通ることで担保する)
- S8 [単体]: Given 第2引数に `TZDate(0, "Pacific/Kiritimati")` を渡す Then その
  タイムゾーンの暦日として解釈された `Date`(`TZDate`)が返る

### `resolveSummaryRange` のTZ対応(`tests/lib/summary/range.test.ts`)

- S9 [単体]: Given `now` が `TZDate(..., "Pacific/Kiritimati")`(UTC+14)・`range=today`・
  `date`省略 Then そのタイムゾーンの今日0時〜翌0時になる(サーバーTZ基準では別の日になる
  時刻を基準時刻に選び、既存のサーバーTZ計算と異なる結果になることを確認する)
- S10 [単体]: Given 同条件で `date=YYYY-MM-DD` を明示 Then その日もタイムゾーンの0時境界で
  解釈される
- S11 [単体・回帰]: Given `now` が通常の `Date`(TZ情報なし) Then 既存のS1〜S12と同じ結果に
  なる(既存シナリオが無改修で通ることで担保)

### `TimezoneSync`(`tests/components/timezone-sync.test.tsx`)

- S12 [結合]: Given Cookie未設定 When マウントする Then ブラウザの検出TZでCookieが書き込まれ、
  `router.refresh()` が1回呼ばれる
- S13 [結合]: Given Cookieがブラウザの検出TZと一致 When マウントする Then Cookieの書き込み・
  `router.refresh()` のいずれも発生しない(無限refreshループの防止を保証する)
- S14 [結合]: Given Cookieがブラウザの検出TZと異なる(端末のTZが変わった想定) When
  マウントする Then 新しい値へ書き換えられ `router.refresh()` が1回呼ばれる
- S15 [単体]: 可視要素を描画しない(`container.firstChild` が `null`)

### `SummaryPage`(結合。`tests/app/(app)/summary/page-timezone.test.tsx` 新規)

- S16 [結合]: Given TZ Cookie がサーバーTZとは異なる日境界になる基準時刻(例:
  サーバーTZでは前日23時台、Cookieのタイムゾーンでは翌日0時台になるインスタント)
  When `range=today`(date省略)で描画する Then Cookieのタイムゾーン基準の「今日」の
  集計になる。Cookieがない場合は従来どおりサーバーTZ基準になることも確認する

## 検証

1. 上記シナリオに対応するテストを実装し、`npx vitest run` で全件合格を確認する
2. R-1: `TZ=UTC` / `TZ=Pacific/Kiritimati`(UTC+14)の両方で新規・既存の対象テストを実行する
3. `npm run check`(typecheck + lint + test + build)の出力を確認する
4. 手動確認(`npm run dev`。ブラウザのシステムTZを一時的に変更できる場合はDevToolsの
   Sensorsパネル等で行う):
   - 初回アクセス(Cookieなし)でも従来どおり `/summary` が表示され、直後に1回だけ
     `router.refresh()` 相当の再読み込みが起きること(Networkタブで確認)
   - 2回目以降のアクセスでCookieが送られ、`range=today` がブラウザのTZ基準の「今日」に
     なっていること
   - 375px 幅での表示崩れがないこと(ロジック変更のみで見た目は変わらない想定だが確認する)
