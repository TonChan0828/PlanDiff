# P13-1 計測しっぱなしの検知とPush通知 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 12時間以上 `end_at IS NULL` のまま放置された計測を日次 cron で検知し、ユーザーの端末へ Web Push 通知を送る。

**Architecture:** Vercel Cron(1日1回・UTC固定)が `/api/cron/stale-timers` を叩き、service role で対象の `time_entries` を引いて `push_subscriptions` の全端末へ `web-push` で送信する。送信に成功したら `time_entries.stale_notified_at` を立て、同じ計測には二度と送らない。購読の登録・解除は認証必須の Route Handler が service role 経由で行い、ブラウザは `public/sw.js`(本リポジトリ初の Service Worker)で通知を受け取る。自動停止は行わない。

**Tech Stack:** Next.js 16(App Router / Route Handlers)、TypeScript strict、Supabase(Postgres + RLS + service role)、`web-push`、`@date-fns/tz`、Vitest + Testing Library、Vercel Cron(`vercel.json`)

**Spec:** `docs/specs/P13-1_計測しっぱなしの検知とPush通知.md`

## Global Constraints

- **CLAUDE.md ルール2(TDD)**: Red → Green → Refactor。`skip` / `todo` / コメントアウト / `--passWithNoTests` による通過は禁止
- **R-1(バグ由来ルール)**: 日時のテストデータは `new Date(2026, 7, 25, 9, 0)` のようにローカルTZで構築する。ISO文字列(`"2026-08-25T00:00:00Z"` / `+09:00` 付き)で固定しない。「今日」に依存するテストは `vi.useFakeTimers({ shouldAdvanceTime: true })` + `setSystemTime` で基準時刻を固定する。**日時を触ったタスクはコミット前に `TZ=UTC npx vitest run <file>` と `TZ=Pacific/Kiritimati npx vitest run <file>` を実行する**
- **TypeScript strict / `any` 禁止**(やむを得ない場合は理由をコメント)
- **日時はUTCでDB保存、表示時にユーザーのTZへ変換**。`Date` の直接演算を避け `date-fns` / `@date-fns/tz` を使う
- **UIテキストは日本語**。文言は `lib/notifications/messages.ts` に集約する(既存の `lib/settings/messages.ts` と同じ形式)
- **秘匿値をクライアントバンドル・ログ・エラーメッセージに含めない**: `VAPID_PRIVATE_KEY` / `CRON_SECRET` / `SUPABASE_SERVICE_ROLE_KEY`、および push の `endpoint` と鍵
- **`push_subscriptions` に RLS ポリシーを作らない**。`grant all to service_role` のみ。`authenticated` / `anon` には GRANT しない(P6-5)
- **エラーを握りつぶさない**。ユーザー向けメッセージは日本語で表示する
- **閾値の定数は1箇所**: `STALE_TIMER_THRESHOLD_HOURS = 12`(`lib/notifications/stale-timer.ts`)。SQL に `interval '12 hours'` を直書きしない
- **比較は `.lte()`**(`<` ではない)。経過ちょうど12時間を対象に含めるため
- **コミットは pre-commit フックを通す**(`format:check` / `typecheck` / `lint` / `test` / `build`)。`--no-verify` を使ったら理由をログに残す

## File Structure

| パス | 責務 |
|---|---|
| `supabase/migrations/<ts>_stale_timer_push_notifications.sql` | 新規。`time_entries.stale_notified_at` 列追加、`push_subscriptions` テーブル+RLS+GRANT |
| `lib/notifications/stale-timer.ts` | 新規。**純粋関数のみ**。閾値定数、閾値時刻の算出、経過時間の整形、TZ解決、通知ペイロード組み立て |
| `lib/notifications/messages.ts` | 新規。通知本文と設定画面の日本語文言 |
| `lib/notifications/store.ts` | 新規。service role による `push_subscriptions` / `time_entries` へのアクセス(通知ドメイン専用) |
| `lib/notifications/push.ts` | 新規。`web-push` のラッパ。VAPID設定と送信、失効(404/410)の判定 |
| `lib/supabase/admin.ts` | 変更。`createAdminClient` を export する(現在はモジュール内 private) |
| `app/api/notifications/subscribe/route.ts` | 新規。`POST`(登録・upsert)/ `DELETE`(解除)。認証必須 |
| `app/api/cron/stale-timers/route.ts` | 新規。cron専用。`CRON_SECRET` 検証 → 検知 → 送信 → マーク |
| `public/sw.js` | 新規。**初の Service Worker**。`push` / `notificationclick` のみ |
| `components/notification-settings.tsx` | 新規。設定画面の通知セクション(client component、4状態) |
| `app/(app)/settings/page.tsx` | 変更。通知セクションを追加 |
| `vercel.json` | 新規。cron 1本 |

**`lib/notifications/store.ts` を新設し `lib/supabase/admin.ts` に足さない理由**: `admin.ts` は164行で既に3ドメイン(google_tokens / アカウント削除 / pro_interest_events)を抱えている。通知の5関数を足すと4ドメイン・約300行になり、責務が薄まる。通知ドメインのクエリは通知ディレクトリにまとめる。

**テストとシナリオの対応**(仕様書 `## テストシナリオ` の番号)

| シナリオ | 置き場所 |
|---|---|
| 1〜4(対象判定) | 1・2は Task 2 の `staleThresholdAt` 単体、3・4は Task 5 の cron 結合テスト(SQL条件の検証) |
| 5〜11(整形・ペイロード) | Task 2 単体 |
| 12〜18(UI4状態) | Task 6 コンポーネント |
| 19〜23(subscribe) | Task 4 結合 |
| 24〜31(cron) | Task 5 結合 |
| 32〜33(GRANT) | Task 1 結合 |

---

### Task 1: マイグレーション(DBスキーマ + RLS + GRANT)

**Files:**
- Create: `supabase/migrations/<timestamp>_stale_timer_push_notifications.sql`
- Modify: `tests/integration/table-grants.test.ts`

**Interfaces:**
- Consumes: なし(最初のタスク)
- Produces: テーブル `public.push_subscriptions`(列: `id uuid`, `user_id uuid`, `endpoint text unique`, `p256dh_key text`, `auth_key text`, `timezone text`, `created_at timestamptz`, `updated_at timestamptz`)、列 `public.time_entries.stale_notified_at timestamptz`

- [ ] **Step 1: マイグレーションファイルを作る**

```bash
npx supabase migration new stale_timer_push_notifications
```

- [ ] **Step 2: SQLを書く**

生成された `supabase/migrations/<timestamp>_stale_timer_push_notifications.sql` に貼る:

```sql
-- P13-1: 計測しっぱなしの検知とPush通知
-- 仕様書: docs/specs/P13-1_計測しっぱなしの検知とPush通知.md

-- 1) time_entries に通知済みマーカーを追加。
--    NULL = 未通知。列追加のみのため既存GRANTがそのまま有効(新規GRANT不要)
alter table public.time_entries
  add column stale_notified_at timestamptz;

-- 2) Push購読。google_tokens / pro_interest_events と同じ「ポリシーを一切作らない」パターン。
--    endpoint と鍵は「その端末へ任意の通知を送る権限」そのもので、漏洩時の影響が
--    アクセストークンに準じる。設定画面の有効/無効判定は pushManager.getSubscription() で
--    ブラウザ側から取れるため、クライアントがこのテーブルを読む必要が一切ない
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh_key text not null,
  auth_key text not null,
  timezone text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
-- ポリシーは作らない。anon / authenticated からは読み書き不可

create trigger set_push_subscriptions_updated_at
  before update on public.push_subscriptions
  for each row execute function private.set_updated_at();

-- Data API への公開(明示GRANT)。service_role のみ。
-- authenticated / anon には GRANT しない(P6-5 の方針)
grant all on public.push_subscriptions to service_role;
```

- [ ] **Step 3: 失敗する結合テストを書く**

`tests/integration/table-grants.test.ts` の `EXPECTED_AUTHENTICATED` の直後のコメントを更新し、末尾の `describe` に2件追加する。

まず定数のコメントを差し替える:

```ts
const EXPECTED_AUTHENTICATED: Record<string, string[]> = {
  profiles: ["SELECT", "UPDATE"],
  synced_events: ["DELETE", "INSERT", "SELECT", "UPDATE"],
  time_entries: ["DELETE", "INSERT", "SELECT", "UPDATE"],
  recurring_rules: ["DELETE", "INSERT", "SELECT", "UPDATE"],
  recurring_exceptions: ["DELETE", "INSERT", "SELECT", "UPDATE"],
  // google_tokens / pro_interest_events / push_subscriptions は
  // service role 専用のため一切付けない
};
```

ファイル末尾に追加:

```ts
// 仕様書: docs/specs/P13-1_計測しっぱなしの検知とPush通知.md S32 / S33
describe("push_subscriptions の権限(P13-1 S32〜S33)", () => {
  it("S32: authenticated は push_subscriptions を SELECT できない", async () => {
    // createTestUser が返す client は既にサインイン済みの authenticated 文脈。
    // TestUser は password を持たないため、この client をそのまま使う
    const { data, error } = await userA.client
      .from("push_subscriptions")
      .select("id");

    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it("S33: anon は push_subscriptions を SELECT できない", async () => {
    const anon = createAnonClient();

    const { data, error } = await anon.from("push_subscriptions").select("id");

    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });
});
```

- [ ] **Step 4: テストを実行して失敗を確認する**

```bash
npx supabase start   # 起動済みならスキップ
npx vitest run --config vitest.config.integration.ts tests/integration/table-grants.test.ts
```

期待: S32 / S33 が失敗する(`push_subscriptions` テーブルがまだ存在しないため、
`error` が「relation does not exist」になるか、S2 の権限一覧が期待と一致しない)。

- [ ] **Step 5: マイグレーションを適用する**

```bash
npx supabase db reset
```

期待: 全マイグレーションがエラーなく再適用される。

- [ ] **Step 6: テストを実行して通ることを確認する**

```bash
npx vitest run --config vitest.config.integration.ts tests/integration/table-grants.test.ts
```

期待: S1〜S33 全件 PASS。

- [ ] **Step 7: 意図しない差分がないことを確認する**

```bash
npx supabase db diff
```

期待: 出力が空(スキーマとマイグレーションが一致)。

- [ ] **Step 8: コミット**

```bash
git add supabase/migrations tests/integration/table-grants.test.ts
git commit -m "feat: push購読テーブルと計測しっぱなし通知済み列を追加する(P13-1)"
```

---

### Task 2: 純粋ロジックと文言(`lib/notifications/stale-timer.ts` / `messages.ts`)

**Files:**
- Create: `lib/notifications/stale-timer.ts`
- Create: `lib/notifications/messages.ts`
- Test: `tests/lib/notifications/stale-timer.test.ts`

**Interfaces:**
- Consumes: なし(純粋関数のみ。DBにもブラウザにも依存しない)
- Produces:
  - `STALE_TIMER_THRESHOLD_HOURS: 12`
  - `STALE_TIMER_TAG: "stale-timer"`
  - `STALE_TIMER_URL: "/track"`
  - `FALLBACK_TIMEZONE: "Asia/Tokyo"`
  - `type StaleTimerPayload = { title: string; body: string; tag: string; url: string }`
  - `staleThresholdAt(now: Date): Date`
  - `formatElapsed(startAt: Date, now: Date): string`
  - `resolveTimezone(timezone: string): string`
  - `buildStaleTimerPayload(input: { entryTitle: string; startAt: Date; now: Date; timezone: string }): StaleTimerPayload`
  - `NOTIFICATION_MESSAGES`(`lib/notifications/messages.ts`)

- [ ] **Step 1: 失敗するテストを書く**

`tests/lib/notifications/stale-timer.test.ts` を新規作成:

```ts
import { describe, expect, it } from "vitest";
import {
  buildStaleTimerPayload,
  formatElapsed,
  resolveTimezone,
  staleThresholdAt,
  STALE_TIMER_TAG,
  STALE_TIMER_THRESHOLD_HOURS,
} from "@/lib/notifications/stale-timer";

// 仕様書: docs/specs/P13-1_計測しっぱなしの検知とPush通知.md S1・S2・S5〜S11
// R-1: 日時はすべてローカルTZで構築する(ISO文字列で固定しない)

describe("staleThresholdAt(S1・S2)", () => {
  it("S1: 経過ちょうど12時間の開始時刻は閾値と一致し、対象に含まれる(lte)", () => {
    const now = new Date(2026, 7, 25, 21, 0);
    const startAt = new Date(2026, 7, 25, 9, 0);

    expect(staleThresholdAt(now).getTime()).toBe(startAt.getTime());
    expect(startAt.getTime() <= staleThresholdAt(now).getTime()).toBe(true);
  });

  it("S2: 経過11時間59分の開始時刻は閾値より後で、対象外になる", () => {
    const now = new Date(2026, 7, 25, 21, 0);
    const startAt = new Date(2026, 7, 25, 9, 1);

    expect(startAt.getTime() <= staleThresholdAt(now).getTime()).toBe(false);
  });

  it("閾値は定数 STALE_TIMER_THRESHOLD_HOURS から算出される", () => {
    expect(STALE_TIMER_THRESHOLD_HOURS).toBe(12);
    const now = new Date(2026, 7, 25, 21, 0);
    const diffHours =
      (now.getTime() - staleThresholdAt(now).getTime()) / (60 * 60 * 1000);
    expect(diffHours).toBe(STALE_TIMER_THRESHOLD_HOURS);
  });
});

describe("formatElapsed(S5〜S7)", () => {
  it("S5: 13時間20分を「13時間20分」と整形する", () => {
    const startAt = new Date(2026, 7, 24, 21, 30);
    const now = new Date(2026, 7, 25, 10, 50);

    expect(formatElapsed(startAt, now)).toBe("13時間20分");
  });

  it("S6: 37時間5分を日数に丸めず「37時間5分」と整形する", () => {
    const startAt = new Date(2026, 7, 24, 8, 0);
    const now = new Date(2026, 7, 25, 21, 5);

    expect(formatElapsed(startAt, now)).toBe("37時間5分");
  });

  it("S7: ちょうど12時間を「12時間0分」と整形する", () => {
    const startAt = new Date(2026, 7, 25, 9, 0);
    const now = new Date(2026, 7, 25, 21, 0);

    expect(formatElapsed(startAt, now)).toBe("12時間0分");
  });
});

describe("resolveTimezone(S9)", () => {
  it("正しいIANA名はそのまま返す", () => {
    expect(resolveTimezone("America/New_York")).toBe("America/New_York");
  });

  it("S9: 不正な文字列は Asia/Tokyo にフォールバックする", () => {
    expect(resolveTimezone("Not/AZone")).toBe("Asia/Tokyo");
  });

  it("S9: 空文字も Asia/Tokyo にフォールバックする", () => {
    expect(resolveTimezone("")).toBe("Asia/Tokyo");
  });
});

describe("buildStaleTimerPayload(S8・S10・S11)", () => {
  const startAt = new Date(2026, 7, 24, 21, 30);
  const now = new Date(2026, 7, 25, 10, 50);

  it("S8: 本文の日時が Asia/Tokyo で整形される", () => {
    const payload = buildStaleTimerPayload({
      entryTitle: "設計レビュー",
      startAt,
      now,
      timezone: "Asia/Tokyo",
    });

    expect(payload.body).toContain("設計レビュー");
    expect(payload.body).toContain("13時間20分");
    // JSTでの開始時刻。ローカルTZに関わらず同じ表記になる
    expect(payload.body).toMatch(/8月2[45]日 \d{2}:\d{2}/);
  });

  it("S8: タイムゾーンが違えば本文の日時表記も変わる", () => {
    const tokyo = buildStaleTimerPayload({
      entryTitle: "設計レビュー",
      startAt,
      now,
      timezone: "Asia/Tokyo",
    });
    const newYork = buildStaleTimerPayload({
      entryTitle: "設計レビュー",
      startAt,
      now,
      timezone: "America/New_York",
    });

    expect(tokyo.body).not.toBe(newYork.body);
    // 経過時間はTZに依存しない
    expect(newYork.body).toContain("13時間20分");
  });

  it("S10: タイトルが空文字なら「(タイトルなし)」になる", () => {
    const payload = buildStaleTimerPayload({
      entryTitle: "",
      startAt,
      now,
      timezone: "Asia/Tokyo",
    });

    expect(payload.body).toContain("(タイトルなし)");
  });

  it("S11: tag が stale-timer で、遷移先が /track", () => {
    const payload = buildStaleTimerPayload({
      entryTitle: "設計レビュー",
      startAt,
      now,
      timezone: "Asia/Tokyo",
    });

    expect(payload.tag).toBe(STALE_TIMER_TAG);
    expect(payload.url).toBe("/track");
    expect(payload.title).toBe("計測しっぱなしかもしれません");
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

```bash
npx vitest run tests/lib/notifications/stale-timer.test.ts
```

期待: FAIL。`Failed to resolve import "@/lib/notifications/stale-timer"`。

- [ ] **Step 3: 文言ファイルを書く**

`lib/notifications/messages.ts`:

```ts
// P13-1 の通知・設定UIの日本語文言。将来のi18nを見据えてここに集約する(CLAUDE.md)

export const NOTIFICATION_MESSAGES = {
  // 通知そのもの
  staleTimerTitle: "計測しっぱなしかもしれません",
  untitledEntry: "(タイトルなし)",
  /** 例: 「設計レビュー」を 8月24日 21:30 から 13時間20分 計測中です */
  staleTimerBody: (title: string, startedAt: string, elapsed: string) =>
    `「${title}」を ${startedAt} から ${elapsed} 計測中です`,
  /** ペイロードが壊れていたときのフォールバック(sw.js 側にも同じ文字列を持つ) */
  staleTimerFallbackBody: "計測しっぱなしの記録があります",

  // 設定画面
  sectionHeading: "通知",
  description:
    "12時間以上続いている計測を、翌朝にお知らせします。停止し忘れた記録に気づけます。",
  enableButton: "通知を有効にする",
  disableButton: "無効にする",
  enabledOnThisDevice: "この端末で有効",
  notEnabled: "この端末では無効",
  blocked:
    "ブラウザの設定で通知がブロックされています。サイトの設定から通知を許可してください",
  iosNeedsHomeScreen:
    "iPhone・iPadでは、ホーム画面に追加したPlanDiffからのみ通知を受け取れます。共有メニューの「ホーム画面に追加」を実行してから、もう一度お試しください",
  unsupported: "この環境では通知を利用できません",
  enableFailed:
    "通知の設定に失敗しました。時間をおいてもう一度お試しください",
  disableFailed:
    "通知の解除に失敗しました。時間をおいてもう一度お試しください",
} as const;
```

- [ ] **Step 4: 純粋ロジックを書く**

`lib/notifications/stale-timer.ts`:

```ts
import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

import { NOTIFICATION_MESSAGES as M } from "@/lib/notifications/messages";

// P13-1 の純粋関数。DB・ブラウザ・環境変数に依存しない(テストしやすさのため)。
// 仕様書: docs/specs/P13-1_計測しっぱなしの検知とPush通知.md

/** 停止し忘れとみなす経過時間。SQLに直書きせず必ずここを参照する */
export const STALE_TIMER_THRESHOLD_HOURS = 12;

/** 同種の通知を積み上げないためのタグ */
export const STALE_TIMER_TAG = "stale-timer";

/** 通知タップ時の遷移先。停止導線があるのは計測画面 */
export const STALE_TIMER_URL = "/track";

/**
 * TZが不正だったときのフォールバック。UTCにすると主要ユーザー(JST)に対して
 * 9時間ずれた文面が出るため、混乱の小さい Asia/Tokyo を選ぶ
 */
export const FALLBACK_TIMEZONE = "Asia/Tokyo";

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export type StaleTimerPayload = {
  title: string;
  body: string;
  tag: string;
  url: string;
};

/**
 * 「これ以前に開始した計測は停止し忘れとみなす」時刻を返す。
 * 呼び出し側は `start_at <= staleThresholdAt(now)` で判定する(境界を含める)
 */
export function staleThresholdAt(now: Date): Date {
  return new Date(now.getTime() - STALE_TIMER_THRESHOLD_HOURS * HOUR_MS);
}

/** 経過時間を「13時間20分」形式にする。24時間を超えても日数に丸めない */
export function formatElapsed(startAt: Date, now: Date): string {
  const totalMinutes = Math.max(
    0,
    Math.floor((now.getTime() - startAt.getTime()) / MINUTE_MS),
  );
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}時間${minutes}分`;
}

/** IANAタイムゾーン名として使えなければフォールバックを返す */
export function resolveTimezone(timezone: string): string {
  try {
    // 不正な値なら RangeError を投げる
    new Intl.DateTimeFormat("ja-JP", { timeZone: timezone });
    return timezone;
  } catch {
    return FALLBACK_TIMEZONE;
  }
}

/** Push本文を組み立てる。表示時刻は購読端末のTZへ変換する */
export function buildStaleTimerPayload(input: {
  entryTitle: string;
  startAt: Date;
  now: Date;
  timezone: string;
}): StaleTimerPayload {
  const timezone = resolveTimezone(input.timezone);
  const startedAt = format(
    new TZDate(input.startAt, timezone),
    "M月d日 HH:mm",
  );
  const title = input.entryTitle.trim() || M.untitledEntry;

  return {
    title: M.staleTimerTitle,
    body: M.staleTimerBody(
      title,
      startedAt,
      formatElapsed(input.startAt, input.now),
    ),
    tag: STALE_TIMER_TAG,
    url: STALE_TIMER_URL,
  };
}
```

- [ ] **Step 5: テストを実行して通ることを確認する**

```bash
npx vitest run tests/lib/notifications/stale-timer.test.ts
```

期待: 全件 PASS。

- [ ] **Step 6: R-1 のTZ確認を行う**

```bash
TZ=UTC npx vitest run tests/lib/notifications/stale-timer.test.ts
TZ=Pacific/Kiritimati npx vitest run tests/lib/notifications/stale-timer.test.ts
```

期待: どちらも全件 PASS。落ちた場合はテストデータのTZ依存(R-1)を疑い、
`new Date(年, 月, 日, 時, 分)` 形式になっているかを確認する。

- [ ] **Step 7: コミット**

```bash
git add lib/notifications tests/lib/notifications
git commit -m "feat: 計測しっぱなし通知の判定と本文組み立てを追加する(P13-1)"
```

---

### Task 3: 通知ドメインのデータアクセスとPush送信

**Files:**
- Create: `lib/notifications/store.ts`
- Create: `lib/notifications/push.ts`
- Modify: `lib/supabase/admin.ts`
- Test: `tests/lib/notifications/push.test.ts`

**Interfaces:**
- Consumes: `StaleTimerPayload`(Task 2)
- Produces:
  - `createAdminClient(): SupabaseClient`(`lib/supabase/admin.ts` から export)
  - `type PushSubscriptionRecord = { id: string; endpoint: string; p256dhKey: string; authKey: string; timezone: string }`
  - `type StaleEntry = { id: string; userId: string; title: string; startAt: Date }`
  - `upsertPushSubscription(input: { userId: string; endpoint: string; p256dhKey: string; authKey: string; timezone: string }): Promise<boolean>`
  - `deletePushSubscriptionByEndpoint(userId: string, endpoint: string): Promise<boolean>`
  - `deletePushSubscriptionById(id: string): Promise<void>`
  - `listPushSubscriptions(userId: string): Promise<PushSubscriptionRecord[]>`
  - `listStaleEntries(threshold: Date): Promise<StaleEntry[]>`
  - `markStaleNotified(entryId: string, at: Date): Promise<void>`
  - `sendStaleTimerPush(subscription: PushSubscriptionRecord, payload: StaleTimerPayload): Promise<PushSendResult>`
  - `type PushSendResult = { ok: true } | { ok: false; expired: boolean }`

- [ ] **Step 1: 依存を追加する**

```bash
npm install web-push
npm install --save-dev @types/web-push
```

- [ ] **Step 2: `createAdminClient` を export する**

`lib/supabase/admin.ts` の `function createAdminClient()` を `export function createAdminClient()` に変える。宣言の直前に理由を書く:

```ts
// 通知ドメイン(lib/notifications/store.ts)からも使うため export する。
// admin.ts は既に3ドメインを抱えており、通知の関数まで足すと責務が薄まるため、
// クエリは通知ディレクトリ側に置く。"server-only" があるのでクライアントには漏れない。
export function createAdminClient() {
```

- [ ] **Step 3: 失敗するテストを書く**

`tests/lib/notifications/push.test.ts` を新規作成。`web-push` は外部への送信境界なのでモックする:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendNotification = vi.fn();
const setVapidDetails = vi.fn();

class FakeWebPushError extends Error {
  statusCode: number;
  constructor(statusCode: number) {
    super(`push failed: ${statusCode}`);
    this.name = "WebPushError";
    this.statusCode = statusCode;
  }
}

vi.mock("web-push", () => ({
  default: { sendNotification, setVapidDetails },
  WebPushError: FakeWebPushError,
}));

import { resetVapidForTest, sendStaleTimerPush } from "@/lib/notifications/push";

// 仕様書: docs/specs/P13-1_計測しっぱなしの検知とPush通知.md §5(失効した購読の削除)

const subscription = {
  id: "sub-1",
  endpoint: "https://push.example.com/abc",
  p256dhKey: "p256dh-value",
  authKey: "auth-value",
  timezone: "Asia/Tokyo",
};

const payload = {
  title: "計測しっぱなしかもしれません",
  body: "「設計レビュー」を 8月24日 21:30 から 13時間20分 計測中です",
  tag: "stale-timer",
  url: "/track",
};

beforeEach(() => {
  vi.clearAllMocks();
  // モジュールスコープの vapidConfigured がテスト間で残ると
  // 「鍵が未設定なら送らない」のテストが順序に依存して落ちる
  resetVapidForTest();
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "public-key";
  process.env.VAPID_PRIVATE_KEY = "private-key";
});

describe("sendStaleTimerPush", () => {
  it("成功したら ok: true を返し、endpoint と鍵を web-push に渡す", async () => {
    sendNotification.mockResolvedValue({ statusCode: 201 });

    const result = await sendStaleTimerPush(subscription, payload);

    expect(result).toEqual({ ok: true });
    expect(sendNotification).toHaveBeenCalledWith(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dhKey, auth: subscription.authKey },
      },
      JSON.stringify(payload),
    );
  });

  it("410 は失効として expired: true を返す", async () => {
    sendNotification.mockRejectedValue(new FakeWebPushError(410));

    const result = await sendStaleTimerPush(subscription, payload);

    expect(result).toEqual({ ok: false, expired: true });
  });

  it("404 も失効として expired: true を返す", async () => {
    sendNotification.mockRejectedValue(new FakeWebPushError(404));

    const result = await sendStaleTimerPush(subscription, payload);

    expect(result).toEqual({ ok: false, expired: true });
  });

  it("500 は一時的な失敗として expired: false を返す", async () => {
    sendNotification.mockRejectedValue(new FakeWebPushError(500));

    const result = await sendStaleTimerPush(subscription, payload);

    expect(result).toEqual({ ok: false, expired: false });
  });

  it("VAPID鍵が未設定なら送信せず expired: false を返す", async () => {
    delete process.env.VAPID_PRIVATE_KEY;

    const result = await sendStaleTimerPush(subscription, payload);

    expect(result).toEqual({ ok: false, expired: false });
    expect(sendNotification).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: テストを実行して失敗を確認する**

```bash
npx vitest run tests/lib/notifications/push.test.ts
```

期待: FAIL。`Failed to resolve import "@/lib/notifications/push"`。

- [ ] **Step 5: Push送信ラッパを書く**

`lib/notifications/push.ts`:

```ts
import "server-only";

import webpush, { WebPushError } from "web-push";

import type { StaleTimerPayload } from "@/lib/notifications/stale-timer";
import type { PushSubscriptionRecord } from "@/lib/notifications/store";

// P13-1: web-push の薄いラッパ。呼び出し側が web-push の型と例外を知らずに済むようにする。
// 秘匿値(VAPID秘密鍵・endpoint・鍵)はログにも戻り値にも含めない

export type PushSendResult = { ok: true } | { ok: false; expired: boolean };

/** 送信先が消えた(購読が無効になった)ことを表すHTTPステータス */
const EXPIRED_STATUS_CODES = new Set([404, 410]);

const VAPID_SUBJECT = "mailto:support@plandiff.app";

let vapidConfigured = false;

/** VAPIDを一度だけ設定する。未設定なら false(呼び出し側は送信を諦める) */
function ensureVapid(): boolean {
  if (vapidConfigured) {
    return true;
  }
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    // 鍵の値そのものは絶対に出さない
    console.error("VAPID鍵が設定されていないため、Push通知を送信できません");
    return false;
  }
  webpush.setVapidDetails(VAPID_SUBJECT, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

/** テスト用に設定状態を戻す(本番コードからは呼ばない) */
export function resetVapidForTest(): void {
  vapidConfigured = false;
}

export async function sendStaleTimerPush(
  subscription: PushSubscriptionRecord,
  payload: StaleTimerPayload,
): Promise<PushSendResult> {
  if (!ensureVapid()) {
    return { ok: false, expired: false };
  }
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dhKey, auth: subscription.authKey },
      },
      JSON.stringify(payload),
    );
    return { ok: true };
  } catch (cause) {
    if (cause instanceof WebPushError) {
      const expired = EXPIRED_STATUS_CODES.has(cause.statusCode);
      // endpoint は出さない。購読IDとステータスだけで追跡できる
      console.error(
        `Push送信に失敗しました(subscription=${subscription.id}, status=${cause.statusCode})`,
      );
      return { ok: false, expired };
    }
    console.error(
      `Push送信に失敗しました(subscription=${subscription.id}):`,
      cause instanceof Error ? cause.name : "unknown",
    );
    return { ok: false, expired: false };
  }
}
```

- [ ] **Step 6: データアクセスを書く**

`lib/notifications/store.ts`:

```ts
import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// P13-1: 通知ドメインの service role アクセス。
// push_subscriptions は RLS ポリシーを持たないため、必ずこの経路だけが読み書きする。
// 仕様書: docs/specs/P13-1_計測しっぱなしの検知とPush通知.md

export type PushSubscriptionRecord = {
  id: string;
  endpoint: string;
  p256dhKey: string;
  authKey: string;
  timezone: string;
};

export type StaleEntry = {
  id: string;
  userId: string;
  title: string;
  startAt: Date;
};

/** 購読を登録する。同じ端末(endpoint)からの再登録はupsertで1行に保つ */
export async function upsertPushSubscription(input: {
  userId: string;
  endpoint: string;
  p256dhKey: string;
  authKey: string;
  timezone: string;
}): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("push_subscriptions").upsert(
      {
        user_id: input.userId,
        endpoint: input.endpoint,
        p256dh_key: input.p256dhKey,
        auth_key: input.authKey,
        timezone: input.timezone,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    );
    if (error) {
      console.error("push_subscriptionsの登録に失敗しました:", error.code);
      return false;
    }
    return true;
  } catch (cause) {
    console.error(
      "push_subscriptionsの登録に失敗しました:",
      cause instanceof Error ? cause.name : "unknown",
    );
    return false;
  }
}

/**
 * 購読を解除する。endpoint だけで消せると他人の購読を消せてしまうため、
 * 必ず user_id との両方を条件にする
 */
export async function deletePushSubscriptionByEndpoint(
  userId: string,
  endpoint: string,
): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .eq("endpoint", endpoint);
    if (error) {
      console.error("push_subscriptionsの削除に失敗しました:", error.code);
      return false;
    }
    return true;
  } catch (cause) {
    console.error(
      "push_subscriptionsの削除に失敗しました:",
      cause instanceof Error ? cause.name : "unknown",
    );
    return false;
  }
}

/** 失効した購読を捨てる。放置するとゴミ行が残り毎朝失敗し続ける */
export async function deletePushSubscriptionById(id: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("push_subscriptions")
      .delete()
      .eq("id", id);
    if (error) {
      console.error("失効した購読の削除に失敗しました:", error.code);
    }
  } catch (cause) {
    console.error(
      "失効した購読の削除に失敗しました:",
      cause instanceof Error ? cause.name : "unknown",
    );
  }
}

export async function listPushSubscriptions(
  userId: string,
): Promise<PushSubscriptionRecord[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh_key, auth_key, timezone")
      .eq("user_id", userId);
    if (error) {
      console.error("push_subscriptionsの取得に失敗しました:", error.code);
      return [];
    }
    return (data ?? []).map((row) => ({
      id: row.id,
      endpoint: row.endpoint,
      p256dhKey: row.p256dh_key,
      authKey: row.auth_key,
      timezone: row.timezone,
    }));
  } catch (cause) {
    console.error(
      "push_subscriptionsの取得に失敗しました:",
      cause instanceof Error ? cause.name : "unknown",
    );
    return [];
  }
}

/**
 * 停止し忘れの候補を全ユーザー横断で取得する。
 * 比較は lte(境界を含める)。閾値の算出は staleThresholdAt に任せる
 */
export async function listStaleEntries(threshold: Date): Promise<StaleEntry[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("time_entries")
      .select("id, user_id, title, start_at")
      .is("end_at", null)
      .is("stale_notified_at", null)
      .lte("start_at", threshold.toISOString());
    if (error) {
      console.error("計測しっぱなしの取得に失敗しました:", error.code);
      return [];
    }
    return (data ?? []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      title: row.title,
      startAt: new Date(row.start_at),
    }));
  } catch (cause) {
    console.error(
      "計測しっぱなしの取得に失敗しました:",
      cause instanceof Error ? cause.name : "unknown",
    );
    return [];
  }
}

/** 通知済みマークを立てる。同じ計測に二度と送らないための唯一の記録 */
export async function markStaleNotified(
  entryId: string,
  at: Date,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("time_entries")
      .update({ stale_notified_at: at.toISOString() })
      .eq("id", entryId);
    if (error) {
      console.error("通知済みマークの更新に失敗しました:", error.code);
    }
  } catch (cause) {
    console.error(
      "通知済みマークの更新に失敗しました:",
      cause instanceof Error ? cause.name : "unknown",
    );
  }
}
```

- [ ] **Step 7: テストを実行して通ることを確認する**

```bash
npx vitest run tests/lib/notifications/push.test.ts
npm run typecheck
```

期待: テスト全件 PASS、typecheck エラーなし。

`resetVapidForTest` は `vapidConfigured` のリークを防ぐためのもの。テストで
`beforeEach` に `resetVapidForTest()` を足す必要があれば追加する
(「VAPID鍵が未設定なら」のテストが他テストの後に走ると設定済みになるため、
**このテストファイルの `beforeEach` の先頭で必ず呼ぶ**)。

- [ ] **Step 8: コミット**

```bash
git add lib/notifications lib/supabase/admin.ts tests/lib/notifications package.json package-lock.json
git commit -m "feat: Push送信ラッパと通知ドメインのデータアクセスを追加する(P13-1)"
```

---

### Task 4: 購読の登録・解除API

**Files:**
- Create: `app/api/notifications/subscribe/route.ts`
- Test: `tests/integration/push-subscribe.test.ts`

**Interfaces:**
- Consumes: `upsertPushSubscription` / `deletePushSubscriptionByEndpoint`(Task 3)、`getSessionUser`(既存 `lib/supabase/session-user.ts`)、`createClient`(既存 `lib/supabase/server.ts`)
- Produces: `POST` / `DELETE` ハンドラ。エンドポイント `/api/notifications/subscribe`

- [ ] **Step 1: 失敗する結合テストを書く**

`tests/integration/push-subscribe.test.ts` を新規作成:

```ts
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { DELETE, POST } from "@/app/api/notifications/subscribe/route";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, createTestUser, deleteTestUser, type TestUser } from "./helpers";

// 仕様書: docs/specs/P13-1_計測しっぱなしの検知とPush通知.md S19〜S23

const admin = createAdminClient();
let userA: TestUser;
let userB: TestUser;

function mockLoggedInUser(userId: string | null) {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: userId ? { id: userId } : null } }),
    },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/notifications/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  endpoint: "https://push.example.com/endpoint-a",
  keys: { p256dh: "p256dh-a", auth: "auth-a" },
  timezone: "Asia/Tokyo",
};

beforeAll(async () => {
  userA = await createTestUser(admin, "通知A");
  userB = await createTestUser(admin, "通知B");
});

afterEach(async () => {
  await admin.from("push_subscriptions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  vi.clearAllMocks();
});

afterAll(async () => {
  await deleteTestUser(admin, userA.id);
  await deleteTestUser(admin, userB.id);
});

describe("POST /api/notifications/subscribe(S19〜S22)", () => {
  it("S19: 未認証は401", async () => {
    mockLoggedInUser(null);

    const response = await POST(jsonRequest(validBody));

    expect(response.status).toBe(401);
  });

  it("S20: 正常なPOSTは204を返し、行が1件作られる", async () => {
    mockLoggedInUser(userA.id);

    const response = await POST(jsonRequest(validBody));

    expect(response.status).toBe(204);
    const { data } = await admin
      .from("push_subscriptions")
      .select("user_id, endpoint, timezone")
      .eq("user_id", userA.id);
    expect(data).toHaveLength(1);
    expect(data?.[0].endpoint).toBe(validBody.endpoint);
    expect(data?.[0].timezone).toBe("Asia/Tokyo");
  });

  it("S21: 同一endpointの再POSTはupsertになり、行が増えずtimezoneが更新される", async () => {
    mockLoggedInUser(userA.id);
    await POST(jsonRequest(validBody));

    const response = await POST(
      jsonRequest({ ...validBody, timezone: "America/New_York" }),
    );

    expect(response.status).toBe(204);
    const { data } = await admin
      .from("push_subscriptions")
      .select("timezone")
      .eq("endpoint", validBody.endpoint);
    expect(data).toHaveLength(1);
    expect(data?.[0].timezone).toBe("America/New_York");
  });

  it("S22: keys.p256dh が欠けていれば400", async () => {
    mockLoggedInUser(userA.id);

    const response = await POST(
      jsonRequest({
        endpoint: validBody.endpoint,
        keys: { auth: "auth-a" },
        timezone: "Asia/Tokyo",
      }),
    );

    expect(response.status).toBe(400);
  });
});

describe("DELETE /api/notifications/subscribe(S23)", () => {
  it("S23: 本人の購読だけを削除し、他ユーザーの行は残す", async () => {
    mockLoggedInUser(userA.id);
    await POST(jsonRequest(validBody));
    mockLoggedInUser(userB.id);
    await POST(
      jsonRequest({ ...validBody, endpoint: "https://push.example.com/endpoint-b" }),
    );

    mockLoggedInUser(userA.id);
    const response = await DELETE(
      new Request("http://localhost/api/notifications/subscribe", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: validBody.endpoint }),
      }),
    );

    expect(response.status).toBe(204);
    const { data } = await admin.from("push_subscriptions").select("user_id");
    expect(data).toHaveLength(1);
    expect(data?.[0].user_id).toBe(userB.id);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

```bash
npx vitest run --config vitest.config.integration.ts tests/integration/push-subscribe.test.ts
```

期待: FAIL。`Failed to resolve import "@/app/api/notifications/subscribe/route"`。

- [ ] **Step 3: Route Handlerを書く**

`app/api/notifications/subscribe/route.ts`:

```ts
import { NextResponse } from "next/server";

import { NOTIFICATION_MESSAGES as M } from "@/lib/notifications/messages";
import {
  deletePushSubscriptionByEndpoint,
  upsertPushSubscription,
} from "@/lib/notifications/store";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/session-user";

// P13-1: Push購読の登録・解除。認証必須。
// push_subscriptions は RLS ポリシーを持たないため、本人確認はこのハンドラの責務。
// 仕様書: docs/specs/P13-1_計測しっぱなしの検知とPush通知.md §4

type SubscribeBody = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
  timezone?: unknown;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

async function requireUserId(): Promise<string | null> {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  return user?.id ?? null;
}

export async function POST(request: Request): Promise<NextResponse> {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: M.enableFailed }, { status: 401 });
  }

  let body: SubscribeBody;
  try {
    body = (await request.json()) as SubscribeBody;
  } catch {
    return NextResponse.json({ error: M.enableFailed }, { status: 400 });
  }

  const endpoint = body.endpoint;
  const p256dhKey = body.keys?.p256dh;
  const authKey = body.keys?.auth;
  const timezone = body.timezone;
  if (
    !isNonEmptyString(endpoint) ||
    !isNonEmptyString(p256dhKey) ||
    !isNonEmptyString(authKey) ||
    !isNonEmptyString(timezone)
  ) {
    return NextResponse.json({ error: M.enableFailed }, { status: 400 });
  }

  const saved = await upsertPushSubscription({
    userId,
    endpoint,
    p256dhKey,
    authKey,
    timezone,
  });
  if (!saved) {
    return NextResponse.json({ error: M.enableFailed }, { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: M.disableFailed }, { status: 401 });
  }

  let endpoint: unknown;
  try {
    const body = (await request.json()) as { endpoint?: unknown };
    endpoint = body.endpoint;
  } catch {
    return NextResponse.json({ error: M.disableFailed }, { status: 400 });
  }
  if (!isNonEmptyString(endpoint)) {
    return NextResponse.json({ error: M.disableFailed }, { status: 400 });
  }

  const deleted = await deletePushSubscriptionByEndpoint(userId, endpoint);
  if (!deleted) {
    return NextResponse.json({ error: M.disableFailed }, { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 4: テストを実行して通ることを確認する**

```bash
npx vitest run --config vitest.config.integration.ts tests/integration/push-subscribe.test.ts
```

期待: S19〜S23 全件 PASS。

- [ ] **Step 5: コミット**

```bash
git add app/api/notifications tests/integration/push-subscribe.test.ts
git commit -m "feat: Push購読の登録・解除APIを追加する(P13-1)"
```

---

### Task 5: cron エンドポイントと Vercel Cron 登録

**Files:**
- Create: `app/api/cron/stale-timers/route.ts`
- Create: `vercel.json`
- Test: `tests/integration/cron-stale-timers.test.ts`

**Interfaces:**
- Consumes: `listStaleEntries` / `listPushSubscriptions` / `markStaleNotified` / `deletePushSubscriptionById`(Task 3)、`sendStaleTimerPush`(Task 3)、`staleThresholdAt` / `buildStaleTimerPayload`(Task 2)
- Produces: `GET /api/cron/stale-timers`。レスポンス JSON `{ candidates: number; notified: number; failed: number; removed: number }`

- [ ] **Step 1: 失敗する結合テストを書く**

`tests/integration/cron-stale-timers.test.ts` を新規作成:

```ts
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const sendStaleTimerPush = vi.fn();
vi.mock("@/lib/notifications/push", () => ({ sendStaleTimerPush }));

import { GET } from "@/app/api/cron/stale-timers/route";
import { createAdminClient, createTestUser, deleteTestUser, type TestUser } from "./helpers";

// 仕様書: docs/specs/P13-1_計測しっぱなしの検知とPush通知.md S3・S4・S24〜S31
// R-1: 日時はローカルTZで構築する

const admin = createAdminClient();
let userA: TestUser;
let userB: TestUser;

const CRON_SECRET = "test-cron-secret";

function cronRequest(secret: string | null): Request {
  return new Request("http://localhost/api/cron/stale-timers", {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

/** 現在時刻から hoursAgo 時間前に開始した実行中タイマーを作る */
async function seedRunningEntry(
  userId: string,
  hoursAgo: number,
  title = "設計レビュー",
): Promise<string> {
  const startAt = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
  const { data, error } = await admin
    .from("time_entries")
    .insert({ user_id: userId, title, start_at: startAt.toISOString() })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function seedSubscription(userId: string, endpoint: string): Promise<string> {
  const { data, error } = await admin
    .from("push_subscriptions")
    .insert({
      user_id: userId,
      endpoint,
      p256dh_key: "p256dh",
      auth_key: "auth",
      timezone: "Asia/Tokyo",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

beforeAll(async () => {
  userA = await createTestUser(admin, "cronA");
  userB = await createTestUser(admin, "cronB");
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = CRON_SECRET;
  sendStaleTimerPush.mockResolvedValue({ ok: true });
});

afterEach(async () => {
  await admin.from("time_entries").delete().in("user_id", [userA.id, userB.id]);
  await admin.from("push_subscriptions").delete().in("user_id", [userA.id, userB.id]);
});

afterAll(async () => {
  await deleteTestUser(admin, userA.id);
  await deleteTestUser(admin, userB.id);
});

describe("認証(S24〜S26)", () => {
  it("S24: Authorization ヘッダなしは401", async () => {
    const response = await GET(cronRequest(null));
    expect(response.status).toBe(401);
  });

  it("S25: 誤ったsecretは401", async () => {
    const response = await GET(cronRequest("wrong-secret"));
    expect(response.status).toBe(401);
  });

  it("S26: CRON_SECRET 未設定なら、検証なしにフォールバックせず401", async () => {
    delete process.env.CRON_SECRET;
    const response = await GET(cronRequest(CRON_SECRET));
    expect(response.status).toBe(401);
  });
});

describe("検知と送信(S3・S4・S27〜S31)", () => {
  it("S27: 対象があれば送信され、stale_notified_at が更新される", async () => {
    const entryId = await seedRunningEntry(userA.id, 13);
    await seedSubscription(userA.id, "https://push.example.com/a");

    const response = await GET(cronRequest(CRON_SECRET));

    expect(response.status).toBe(200);
    expect(sendStaleTimerPush).toHaveBeenCalledTimes(1);
    const { data } = await admin
      .from("time_entries")
      .select("stale_notified_at")
      .eq("id", entryId)
      .single();
    expect(data?.stale_notified_at).not.toBeNull();
  });

  it("S3: end_at が入っている計測は対象外", async () => {
    const startAt = new Date(Date.now() - 13 * 60 * 60 * 1000);
    const endAt = new Date(Date.now() - 60 * 60 * 1000);
    await admin.from("time_entries").insert({
      user_id: userA.id,
      title: "完了済み",
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
    });
    await seedSubscription(userA.id, "https://push.example.com/a");

    await GET(cronRequest(CRON_SECRET));

    expect(sendStaleTimerPush).not.toHaveBeenCalled();
  });

  it("S4: stale_notified_at が入っている計測は対象外", async () => {
    const startAt = new Date(Date.now() - 13 * 60 * 60 * 1000);
    await admin.from("time_entries").insert({
      user_id: userA.id,
      title: "通知済み",
      start_at: startAt.toISOString(),
      stale_notified_at: new Date().toISOString(),
    });
    await seedSubscription(userA.id, "https://push.example.com/a");

    await GET(cronRequest(CRON_SECRET));

    expect(sendStaleTimerPush).not.toHaveBeenCalled();
  });

  it("S28: 対象がなければ200で送信0件", async () => {
    await seedRunningEntry(userA.id, 3);
    await seedSubscription(userA.id, "https://push.example.com/a");

    const response = await GET(cronRequest(CRON_SECRET));

    expect(response.status).toBe(200);
    expect(sendStaleTimerPush).not.toHaveBeenCalled();
  });

  it("S29: 購読が0件のユーザーは stale_notified_at が更新されない", async () => {
    const entryId = await seedRunningEntry(userA.id, 13);

    await GET(cronRequest(CRON_SECRET));

    const { data } = await admin
      .from("time_entries")
      .select("stale_notified_at")
      .eq("id", entryId)
      .single();
    expect(data?.stale_notified_at).toBeNull();
  });

  it("S30: 410を返した購読は push_subscriptions から削除される", async () => {
    await seedRunningEntry(userA.id, 13);
    await seedSubscription(userA.id, "https://push.example.com/a");
    sendStaleTimerPush.mockResolvedValue({ ok: false, expired: true });

    await GET(cronRequest(CRON_SECRET));

    const { data } = await admin
      .from("push_subscriptions")
      .select("id")
      .eq("user_id", userA.id);
    expect(data).toHaveLength(0);
  });

  it("S31: 1つの購読が失敗しても同一ユーザーの他の購読への送信は続く", async () => {
    const entryId = await seedRunningEntry(userA.id, 13);
    await seedSubscription(userA.id, "https://push.example.com/a");
    await seedSubscription(userA.id, "https://push.example.com/b");
    sendStaleTimerPush
      .mockResolvedValueOnce({ ok: false, expired: false })
      .mockResolvedValueOnce({ ok: true });

    await GET(cronRequest(CRON_SECRET));

    expect(sendStaleTimerPush).toHaveBeenCalledTimes(2);
    // 1件でも成功していればマークする
    const { data } = await admin
      .from("time_entries")
      .select("stale_notified_at")
      .eq("id", entryId)
      .single();
    expect(data?.stale_notified_at).not.toBeNull();
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

```bash
npx vitest run --config vitest.config.integration.ts tests/integration/cron-stale-timers.test.ts
```

期待: FAIL。`Failed to resolve import "@/app/api/cron/stale-timers/route"`。

- [ ] **Step 3: cron Route Handlerを書く**

`app/api/cron/stale-timers/route.ts`:

```ts
import { NextResponse } from "next/server";

import { sendStaleTimerPush } from "@/lib/notifications/push";
import {
  buildStaleTimerPayload,
  staleThresholdAt,
} from "@/lib/notifications/stale-timer";
import {
  deletePushSubscriptionById,
  listPushSubscriptions,
  listStaleEntries,
  markStaleNotified,
  type StaleEntry,
} from "@/lib/notifications/store";

// P13-1: 停止し忘れの計測を日次で検知し、Push通知を送る。
// Vercel Cron が Authorization: Bearer ${CRON_SECRET} を付けて呼ぶ。
// 仕様書: docs/specs/P13-1_計測しっぱなしの検知とPush通知.md §5

/** 送信結果の集計。endpoint や鍵は一切含めない */
type CronSummary = {
  candidates: number;
  notified: number;
  failed: number;
  removed: number;
};

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // 未設定を「検証なし」にフォールバックさせない
  if (!secret) {
    console.error("CRON_SECRETが未設定のため、cronリクエストを拒否しました");
    return false;
  }
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/** 1ユーザー分を処理する。1件でも送信に成功したら通知済みにする */
async function notifyUser(
  entries: StaleEntry[],
  now: Date,
  summary: CronSummary,
): Promise<void> {
  const subscriptions = await listPushSubscriptions(entries[0].userId);
  if (subscriptions.length === 0) {
    // 通知できていないので未通知のまま残す。後日購読すれば翌朝に拾われる
    return;
  }

  for (const entry of entries) {
    const results = await Promise.allSettled(
      subscriptions.map(async (subscription) => {
        const payload = buildStaleTimerPayload({
          entryTitle: entry.title,
          startAt: entry.startAt,
          now,
          timezone: subscription.timezone,
        });
        const result = await sendStaleTimerPush(subscription, payload);
        if (!result.ok && result.expired) {
          await deletePushSubscriptionById(subscription.id);
          summary.removed += 1;
        }
        return result;
      }),
    );

    const succeeded = results.some(
      (result) => result.status === "fulfilled" && result.value.ok,
    );
    if (succeeded) {
      await markStaleNotified(entry.id, now);
      summary.notified += 1;
    } else {
      summary.failed += 1;
    }
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const entries = await listStaleEntries(staleThresholdAt(now));
  const summary: CronSummary = {
    candidates: entries.length,
    notified: 0,
    failed: 0,
    removed: 0,
  };

  const byUser = new Map<string, StaleEntry[]>();
  for (const entry of entries) {
    const list = byUser.get(entry.userId);
    if (list) {
      list.push(entry);
    } else {
      byUser.set(entry.userId, [entry]);
    }
  }

  // ユーザー単位で直列。1ユーザーの失敗が他ユーザーを止めないよう例外は個別に握る
  for (const userEntries of byUser.values()) {
    try {
      await notifyUser(userEntries, now, summary);
    } catch (cause) {
      summary.failed += userEntries.length;
      console.error(
        "ユーザー単位の通知処理に失敗しました:",
        cause instanceof Error ? cause.name : "unknown",
      );
    }
  }

  return NextResponse.json(summary, { status: 200 });
}
```

- [ ] **Step 4: テストを実行して通ることを確認する**

```bash
npx vitest run --config vitest.config.integration.ts tests/integration/cron-stale-timers.test.ts
```

期待: S3・S4・S24〜S31 全件 PASS。

- [ ] **Step 5: Vercel Cron を登録する**

`vercel.json` を新規作成:

```json
{
  "crons": [
    {
      "path": "/api/cron/stale-timers",
      "schedule": "0 22 * * *"
    }
  ]
}
```

`0 22 * * *`(UTC)= JST 7:00。Hobbyプランは精度±59分のため実際の到達は
JST 7:00〜7:59 の間になる。Hobby は「1日1回」しか許されないため、
`0 * * * *` のような表現に変えるとデプロイが失敗する。

- [ ] **Step 6: ビルドが通ることを確認する**

```bash
npm run build
```

期待: 成功し、ルート一覧に `ƒ /api/cron/stale-timers` と
`ƒ /api/notifications/subscribe` が現れる。

- [ ] **Step 7: コミット**

```bash
git add app/api/cron vercel.json tests/integration/cron-stale-timers.test.ts
git commit -m "feat: 計測しっぱなしを日次検知してPush通知するcronを追加する(P13-1)"
```

---

### Task 6: Service Worker と設定画面の通知セクション

**Files:**
- Create: `public/sw.js`
- Create: `components/notification-settings.tsx`
- Modify: `app/(app)/settings/page.tsx`
- Test: `tests/components/notification-settings.test.tsx`

**Interfaces:**
- Consumes: `NOTIFICATION_MESSAGES`(Task 2)、`POST` / `DELETE /api/notifications/subscribe`(Task 4)
- Produces: `NotificationSettings`(props なし、named export)

- [ ] **Step 1: 失敗するコンポーネントテストを書く**

`tests/components/notification-settings.test.tsx` を新規作成:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { NotificationSettings } from "@/components/notification-settings";
import { NOTIFICATION_MESSAGES as M } from "@/lib/notifications/messages";

// 仕様書: docs/specs/P13-1_計測しっぱなしの検知とPush通知.md S12〜S18

type SetupOptions = {
  supported?: boolean;
  permission?: NotificationPermission;
  existingSubscription?: boolean;
  standalone?: boolean;
  userAgent?: string;
  subscribeRejects?: boolean;
};

const subscribe = vi.fn();
const getSubscription = vi.fn();
const unsubscribe = vi.fn();
const requestPermission = vi.fn();

function setup(options: SetupOptions = {}) {
  const {
    supported = true,
    permission = "default",
    existingSubscription = false,
    standalone = true,
    userAgent = "Mozilla/5.0 (Macintosh)",
    subscribeRejects = false,
  } = options;

  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("standalone") ? standalone : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  Object.defineProperty(window.navigator, "userAgent", {
    value: userAgent,
    configurable: true,
  });

  if (!supported) {
    // PushManager も serviceWorker も無い環境を作る
    Reflect.deleteProperty(window, "PushManager");
    Reflect.deleteProperty(window.navigator, "serviceWorker");
    return;
  }

  const fakeSubscription = {
    endpoint: "https://push.example.com/a",
    unsubscribe: unsubscribe.mockResolvedValue(true),
    toJSON: () => ({
      endpoint: "https://push.example.com/a",
      keys: { p256dh: "p256dh", auth: "auth" },
    }),
  };

  getSubscription.mockResolvedValue(existingSubscription ? fakeSubscription : null);
  subscribe.mockImplementation(() =>
    subscribeRejects
      ? Promise.reject(new Error("denied"))
      : Promise.resolve(fakeSubscription),
  );
  requestPermission.mockResolvedValue(
    subscribeRejects ? "denied" : ("granted" as NotificationPermission),
  );

  vi.stubGlobal("PushManager", class {});
  Object.defineProperty(window.navigator, "serviceWorker", {
    value: {
      register: vi.fn().mockResolvedValue({ pushManager: { subscribe, getSubscription } }),
      ready: Promise.resolve({ pushManager: { subscribe, getSubscription } }),
    },
    configurable: true,
  });
  vi.stubGlobal("Notification", { permission, requestPermission });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  // navigator.serviceWorker は defineProperty で足しているため
  // unstubAllGlobals では消えない。次のテストへ漏らさないよう明示的に消す
  Reflect.deleteProperty(window.navigator, "serviceWorker");
  Reflect.deleteProperty(window, "PushManager");
});

describe("NotificationSettings(S12〜S18)", () => {
  it("S12: PushManager非対応かつ非standaloneならホーム画面追加を案内する", async () => {
    setup({ supported: false, standalone: false, userAgent: "Mozilla/5.0 (iPhone)" });

    render(<NotificationSettings />);

    expect(await screen.findByText(M.iosNeedsHomeScreen)).toBeInTheDocument();
  });

  it("S13: 未許可なら「通知を有効にする」ボタンが出る", async () => {
    setup({ permission: "default" });

    render(<NotificationSettings />);

    expect(
      await screen.findByRole("button", { name: M.enableButton }),
    ).toBeInTheDocument();
  });

  it("S14: ブロック済みなら案内が出て、有効化ボタンは出ない", async () => {
    setup({ permission: "denied" });

    render(<NotificationSettings />);

    expect(await screen.findByText(M.blocked)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: M.enableButton }),
    ).not.toBeInTheDocument();
  });

  it("S15: 既存購読ありなら「この端末で有効」と解除ボタンが出る", async () => {
    setup({ permission: "granted", existingSubscription: true });

    render(<NotificationSettings />);

    expect(await screen.findByText(M.enabledOnThisDevice)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: M.disableButton }),
    ).toBeInTheDocument();
  });

  it("S16: 有効化で requestPermission → subscribe → POST の順に呼ばれる", async () => {
    setup({ permission: "default" });

    render(<NotificationSettings />);
    fireEvent.click(await screen.findByRole("button", { name: M.enableButton }));

    await waitFor(() => {
      expect(requestPermission).toHaveBeenCalled();
      expect(subscribe).toHaveBeenCalled();
      expect(fetch).toHaveBeenCalledWith(
        "/api/notifications/subscribe",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("S17: 許可を拒否されたらブロック案内に切り替わる", async () => {
    setup({ permission: "default", subscribeRejects: true });

    render(<NotificationSettings />);
    fireEvent.click(await screen.findByRole("button", { name: M.enableButton }));

    expect(await screen.findByText(M.blocked)).toBeInTheDocument();
  });

  it("S18: POSTが失敗したら日本語のエラーが表示される", async () => {
    setup({ permission: "default" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 500 })),
    );

    render(<NotificationSettings />);
    fireEvent.click(await screen.findByRole("button", { name: M.enableButton }));

    expect(await screen.findByText(M.enableFailed)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

```bash
npx vitest run tests/components/notification-settings.test.tsx
```

期待: FAIL。`Failed to resolve import "@/components/notification-settings"`。

- [ ] **Step 3: Service Worker を書く**

`public/sw.js`:

```js
// P13-1: 本リポジトリ初の Service Worker。Push受信のみを担当する。
// オフラインキャッシュは実装しない(P3-3 の判断を維持)。
// 仕様書: docs/specs/P13-1_計測しっぱなしの検知とPush通知.md §2

const FALLBACK_TITLE = "計測しっぱなしかもしれません";
const FALLBACK_BODY = "計測しっぱなしの記録があります";
const DEFAULT_URL = "/track";

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // ペイロードが壊れていても無音にはしない(汎用文言で必ず出す)
    payload = {};
  }

  const title = payload.title || FALLBACK_TITLE;
  const options = {
    body: payload.body || FALLBACK_BODY,
    tag: payload.tag || "stale-timer",
    icon: "/icon-192",
    badge: "/icon-192",
    data: { url: payload.url || DEFAULT_URL },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || DEFAULT_URL;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          // 既に開いている PlanDiff があればそれを使う(二重起動を避ける)
          if (client.url.includes(targetUrl) && "focus" in client) {
            return client.focus();
          }
        }
        for (const client of clientList) {
          if ("navigate" in client && "focus" in client) {
            return client.navigate(targetUrl).then((navigated) =>
              navigated ? navigated.focus() : undefined,
            );
          }
        }
        return self.clients.openWindow(targetUrl);
      }),
  );
});
```

- [ ] **Step 4: 設定コンポーネントを書く**

`components/notification-settings.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";

import { NOTIFICATION_MESSAGES as M } from "@/lib/notifications/messages";

// P13-1: 設定画面の通知セクション。ブラウザの購読状態が唯一の真実で、
// サーバーには問い合わせない(push_subscriptions はクライアントから読めない)。
// 仕様書: docs/specs/P13-1_計測しっぱなしの検知とPush通知.md §3

const SUBSCRIBE_ENDPOINT = "/api/notifications/subscribe";

type Status =
  | "loading"
  | "unsupported"
  | "iosNeedsHomeScreen"
  | "blocked"
  | "enabled"
  | "disabled";

function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    typeof Notification !== "undefined"
  );
}

/** 案内文を出し分けるためだけの補助判定。機能検出を優先し、これは文言選択にしか使わない */
function isIosLikeWithoutHomeScreen(): boolean {
  const ua = navigator.userAgent;
  const isIos = /iPhone|iPad|iPod/.test(ua);
  const standalone = window.matchMedia("(display-mode: standalone)").matches;
  return isIos && !standalone;
}

/** base64url の VAPID公開鍵を Uint8Array に変換する(Push API の要求形式) */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

export function NotificationSettings() {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const detect = async () => {
      if (!isPushSupported()) {
        const next = isIosLikeWithoutHomeScreen()
          ? "iosNeedsHomeScreen"
          : "unsupported";
        if (!cancelled) setStatus(next);
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setStatus("blocked");
        return;
      }
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        const subscription = await registration.pushManager.getSubscription();
        if (!cancelled) setStatus(subscription ? "enabled" : "disabled");
      } catch {
        if (!cancelled) setStatus("unsupported");
      }
    };

    void detect();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleEnable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("blocked");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
        ),
      });
      const json = subscription.toJSON();
      const response = await fetch(SUBSCRIBE_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      if (!response.ok) {
        setError(M.enableFailed);
        return;
      }
      setStatus("enabled");
    } catch {
      // 許可ダイアログでの拒否・subscribe の失敗はどちらもここに来る。
      // ユーザーから見れば「有効にできなかった」で同じなのでブロック案内に寄せる
      setStatus("blocked");
    } finally {
      setBusy(false);
    }
  }, []);

  const handleDisable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch(SUBSCRIBE_ENDPOINT, {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setStatus("disabled");
    } catch {
      setError(M.disableFailed);
    } finally {
      setBusy(false);
    }
  }, []);

  if (status === "loading") {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-ink-muted text-sm">{M.description}</p>

      {status === "unsupported" ? (
        <p className="text-ink-muted text-sm">{M.unsupported}</p>
      ) : null}
      {status === "iosNeedsHomeScreen" ? (
        <p className="text-ink-muted text-sm">{M.iosNeedsHomeScreen}</p>
      ) : null}
      {status === "blocked" ? (
        <p className="text-ink-muted text-sm">{M.blocked}</p>
      ) : null}

      {status === "enabled" ? (
        <>
          <p className="text-sm font-medium">{M.enabledOnThisDevice}</p>
          <button
            type="button"
            onClick={handleDisable}
            disabled={busy}
            className="border-line hover:bg-ink/5 inline-flex min-h-11 w-fit items-center justify-center rounded-lg border px-4 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {M.disableButton}
          </button>
        </>
      ) : null}

      {status === "disabled" ? (
        <>
          <p className="text-ink-muted text-sm">{M.notEnabled}</p>
          <button
            type="button"
            onClick={handleEnable}
            disabled={busy}
            className="bg-brand text-brand-ink hover:bg-brand/90 inline-flex min-h-11 w-fit items-center justify-center rounded-lg px-6 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {M.enableButton}
          </button>
        </>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: テストを実行して通ることを確認する**

```bash
npx vitest run tests/components/notification-settings.test.tsx
```

期待: S12〜S18 全件 PASS。落ちる場合は `setup()` のグローバル差し替えが
コンポーネントの `useEffect` より後になっていないかを確認する
(`render` の前に `setup()` を呼ぶ)。

- [ ] **Step 6: 設定画面に組み込む**

`app/(app)/settings/page.tsx` の import に追加:

```tsx
import { NotificationSettings } from "@/components/notification-settings";
import { NOTIFICATION_MESSAGES as N } from "@/lib/notifications/messages";
```

「外観」セクションの直後(`{M.themeSectionHeading}` の `</section>` の次)に挿入:

```tsx
      <section className="border-line bg-surface flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="text-base font-semibold">{N.sectionHeading}</h2>
        <NotificationSettings />
      </section>
```

- [ ] **Step 7: 全テストとビルドを実行する**

```bash
npm run check
```

期待: typecheck / lint / test / build すべて成功(EXIT=0)。

- [ ] **Step 8: コミット**

```bash
git add public/sw.js components/notification-settings.tsx "app/(app)/settings/page.tsx" tests/components/notification-settings.test.tsx
git commit -m "feat: 設定画面に通知セクションとService Workerを追加する(P13-1)"
```

---

### Task 7: 仕上げ(375px確認・ドキュメント・残タスクの明文化)

**Files:**
- Modify: `docs/開発計画.md`
- Modify: `docs/specs/P13-1_計測しっぱなしの検知とPush通知.md`
- Create: `docs/logs/<実施日>.md`(既にあれば追記)

**Interfaces:**
- Consumes: Task 1〜6 の成果すべて
- Produces: なし(ドキュメントのみ)

- [ ] **Step 1: `npm run check` を実行して出力を確認する**

```bash
npm run check
```

期待: EXIT=0。テスト件数を控えておく(ログに書く)。

- [ ] **Step 2: 結合テストを全件実行する**

```bash
npx supabase start   # 起動済みならスキップ
npm run test:integration
```

期待: 全件 PASS。件数を控えておく。

- [ ] **Step 3: R-1 のTZ確認を全体で行う**

```bash
TZ=UTC npm test
TZ=Pacific/Kiritimati npm test
```

期待: どちらも全件 PASS。

- [ ] **Step 4: 375px で設定画面を確認する**

`ui-quality` Skill のチェックリストに従う。開発サーバーを起動し、`/settings` を
375×667 で開いて確認する:

- 横スクロールが 0px(`document.documentElement.scrollWidth <= window.innerWidth`)
- 通知セクションの4状態それぞれで文字が折り返され、はみ出さない
  (特に `iosNeedsHomeScreen` は長文なので要確認)
- ボタンのタップターゲットが 44px 以上(`min-h-11` = 44px)
- ライト / ダークの両方でコントラストが確保されている
- 色のハードコードがないこと(`tests/lib/design/no-raw-colors.test.ts` が守る)

- [ ] **Step 5: 仕様書のステータスを更新する**

`docs/specs/P13-1_計測しっぱなしの検知とPush通知.md` の先頭を書き換える:

```markdown
- ステータス: 実装完了(<実施日>)
```

「検証(手動)」のチェックボックスのうち、実際に確認できたものにチェックを入れる。
**確認できていない項目にチェックを入れない**(実機のiOS確認など)。

- [ ] **Step 6: 開発計画を更新する**

`docs/開発計画.md` の P13-1 の行の「状態」を `完了` にし、表の下に完了メモを追記する。
`**最終更新**` 行も更新する。「次に着手」セクションの項目0を、完了を反映した記述に直す。

- [ ] **Step 7: 行動履歴を書く**

`docs/logs/<実施日>.md` に「何を・なぜ・結果」を追記する。必ず含める:

- 実行したテスト件数(単体・結合それぞれ)と全件合格である旨
- `TZ=UTC` / `TZ=Pacific/Kiritimati` での確認結果(R-1)
- 375px 確認の実測値
- **残タスク(ユーザー作業)**: VAPID鍵の生成と Vercel への環境変数登録3本、
  本番 Supabase への `npx supabase db push`、デプロイ後の Cron Jobs 登録確認

- [ ] **Step 8: コミット**

```bash
git add docs
git commit -m "docs: P13-1の完了を記録する"
```

---

## 残タスク(実装後・ユーザー作業)

実装完了後もこれらが済むまで本番では動かない。仕様書の「残タスク」と同じ内容:

1. `npx web-push generate-vapid-keys` で鍵を生成する
2. Vercel に環境変数を登録する: `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `CRON_SECRET`
3. ローカルの `.env.local` にも同じ3本を追加する(開発時の手動実行用)
4. 本番 Supabase へ `npx supabase db push`(テーブル追加+列追加のため必須)
5. 本番デプロイ後、Vercel ダッシュボードの Cron Jobs にジョブが登録されたことを確認する
6. 実機(Android Chrome / iOS はホーム画面追加した PWA)で通知の到達を確認する
