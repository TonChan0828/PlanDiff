import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addDays, startOfDay, startOfWeek } from "date-fns";
import { fetchSyncedEvents } from "@/lib/calendar/events";
import { computeGapSummary } from "@/lib/summary/aggregate";
import { startTimer, stopTimer } from "@/lib/timer/service";
import { actualBlockInputs } from "@/lib/timer/blocks";
import { fetchRunningEntry, fetchTimeEntries } from "@/lib/timer/entries";
import {
  createAdminClient,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "./helpers";

// 仕様書: docs/specs/P3-2_ギャップサマリー.md S10〜S15
// page(Server Component)が使うデータ取得〜集計の流れを、ローカルSupabase+RLSで検証する。
// (P2-1のfetchSyncedEvents結合テストと同じ方針。ページ自体のレンダリングはテストしない)

const admin = createAdminClient();
let userA: TestUser;

const NOW = new Date();
const TODAY_RANGE = {
  start: startOfDay(NOW),
  end: addDays(startOfDay(NOW), 1),
};
const WEEK_START = startOfWeek(NOW, { weekStartsOn: 1 });
const WEEK_RANGE = { start: WEEK_START, end: addDays(WEEK_START, 7) };

async function seedEvent(
  user: TestUser,
  googleEventId: string,
  title: string,
  startAt: Date,
  endAt: Date,
): Promise<void> {
  const { error } = await user.client.from("synced_events").insert({
    user_id: user.id,
    google_event_id: googleEventId,
    title,
    start_at: startAt.toISOString(),
    end_at: endAt.toISOString(),
    synced_at: new Date().toISOString(),
  });
  expect(error).toBeNull();
}

async function seedEntry(
  user: TestUser,
  googleEventId: string | null,
  title: string,
  startAt: Date,
  endAt: Date,
): Promise<void> {
  const { error } = await user.client.from("time_entries").insert({
    user_id: user.id,
    google_event_id: googleEventId,
    title,
    start_at: startAt.toISOString(),
    end_at: endAt.toISOString(),
  });
  expect(error).toBeNull();
}

async function buildSummary(user: TestUser, range: typeof TODAY_RANGE) {
  const [planEvents, timeEntries, runningEntry] = await Promise.all([
    fetchSyncedEvents(user.client, NOW),
    fetchTimeEntries(user.client, NOW),
    fetchRunningEntry(user.client),
  ]);
  const actualInputs = actualBlockInputs(timeEntries, runningEntry, NOW);
  return computeGapSummary(planEvents, actualInputs, range);
}

beforeAll(async () => {
  userA = await createTestUser(admin, "ユーザーA");
});

afterAll(async () => {
  await deleteTestUser(admin, userA.id);
});

beforeEach(async () => {
  await admin
    .from("synced_events")
    .delete()
    .gte("synced_at", "1970-01-01T00:00:00Z");
  await admin
    .from("time_entries")
    .delete()
    .gte("created_at", "1970-01-01T00:00:00Z");
});

describe("ギャップサマリーのデータ取得〜集計(結合)", () => {
  it("S10: 今日の範囲に予定・実績が存在する場合、計画合計・実績合計・ズレが計算される", async () => {
    const start = new Date(NOW);
    start.setHours(9, 0, 0, 0);
    const end = new Date(NOW);
    end.setHours(10, 0, 0, 0);
    await seedEvent(userA, "g-1", "設計レビュー", start, end);
    await seedEntry(userA, "g-1", "設計レビュー", start, end);

    const summary = await buildSummary(userA, TODAY_RANGE);

    expect(summary.planTotalMinutes).toBe(60);
    expect(summary.actualTotalMinutes).toBe(60);
    expect(summary.gapMinutes).toBe(0);
    expect(summary.gapPercent).toBe(0);
  });

  it("S11: 「今週」範囲で集計すると、今日の範囲とは異なる値になる", async () => {
    const todayStart = new Date(NOW);
    todayStart.setHours(9, 0, 0, 0);
    const todayEnd = new Date(NOW);
    todayEnd.setHours(10, 0, 0, 0);
    await seedEvent(userA, "g-1", "今日の予定", todayStart, todayEnd);

    // 今週内・今日ではない日の予定(今日が月曜でない前提のテストにするため、
    // 週の最初の日を使う。今日と重複する場合はテストの意図が変わるため避ける)
    const otherDay =
      WEEK_START.getTime() === startOfDay(NOW).getTime()
        ? addDays(WEEK_START, 1)
        : WEEK_START;
    const otherStart = new Date(otherDay);
    otherStart.setHours(9, 0, 0, 0);
    const otherEnd = new Date(otherDay);
    otherEnd.setHours(11, 0, 0, 0);
    await seedEvent(userA, "g-2", "週内別日の予定", otherStart, otherEnd);

    const todaySummary = await buildSummary(userA, TODAY_RANGE);
    const weekSummary = await buildSummary(userA, WEEK_RANGE);

    expect(todaySummary.planTotalMinutes).toBe(60);
    expect(weekSummary.planTotalMinutes).toBe(180);
  });

  it("S12: 実績が紐づかない予定がある場合、未着手として集計される", async () => {
    const start = new Date(NOW);
    start.setHours(9, 0, 0, 0);
    const end = new Date(NOW);
    end.setHours(10, 0, 0, 0);
    await seedEvent(userA, "g-1", "未着手の予定", start, end);

    const summary = await buildSummary(userA, TODAY_RANGE);

    expect(summary.items).toEqual([
      {
        googleEventId: "g-1",
        title: "未着手の予定",
        planMinutes: 60,
        actualMinutes: 0,
        gapMinutes: -60,
        notStarted: true,
      },
    ]);
  });

  it("S13: 予定に紐づかない実績(フリータイマー)は割り込みとして集計される", async () => {
    const start = new Date(NOW);
    start.setHours(20, 0, 0, 0);
    const end = new Date(NOW);
    end.setHours(20, 30, 0, 0);
    await seedEntry(userA, null, "読書", start, end);

    const summary = await buildSummary(userA, TODAY_RANGE);

    expect(summary.planTotalMinutes).toBe(0);
    expect(summary.gapPercent).toBeNull();
    expect(summary.interruptions).toEqual([
      expect.objectContaining({ title: "読書", actualMinutes: 30 }),
    ]);
  });

  it("S14: 対象範囲に予定が1件もない場合、gapPercentはnullでエラーにならない", async () => {
    const summary = await buildSummary(userA, TODAY_RANGE);

    expect(summary.planTotalMinutes).toBe(0);
    expect(summary.gapPercent).toBeNull();
    expect(summary.items).toEqual([]);
  });

  it("S15: 実行中タイマーがある場合、実績合計に開始〜現在時刻分が加算される", async () => {
    await startTimer(userA.client, { googleEventId: null, title: "作業中" });

    const summary = await buildSummary(userA, TODAY_RANGE);

    expect(summary.interruptions).toHaveLength(1);
    expect(summary.interruptions[0]!.actualMinutes).toBeGreaterThanOrEqual(0);
    expect(summary.actualTotalMinutes).toBeGreaterThanOrEqual(0);

    await stopTimer(userA.client);
  });
});
