import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addDays, startOfDay } from "date-fns";
import { fetchSyncedEventsInRange } from "@/lib/calendar/events";
import {
  RECURRING_ID_PREFIX,
  materializeRecurringInstances,
} from "@/lib/calendar/recurring";
import { computeSyncRange } from "@/lib/google/sync-range";
import { computeGapSummary } from "@/lib/summary/aggregate";
import { resolveSummaryRange, toSyncRange } from "@/lib/summary/range";
import { actualBlockInputs } from "@/lib/timer/blocks";
import {
  fetchRunningEntry,
  fetchTimeEntriesInRange,
} from "@/lib/timer/entries";
import {
  createAdminClient,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "./helpers";

// 仕様書: docs/specs/P5-9_サマリーの任意期間表示.md S40〜S44
// 任意期間の取得〜定期予定の実体化〜集計の流れを、ローカルSupabase+RLSで検証する。

const admin = createAdminClient();
let userA: TestUser;

const NOW = new Date();

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
  endAt: Date | null,
): Promise<void> {
  const { error } = await user.client.from("time_entries").insert({
    user_id: user.id,
    google_event_id: googleEventId,
    title,
    start_at: startAt.toISOString(),
    end_at: endAt ? endAt.toISOString() : null,
  });
  expect(error).toBeNull();
}

/** 指定日の hour 時ちょうど(ローカル) */
function at(day: Date, hour: number): Date {
  const date = startOfDay(day);
  date.setHours(hour, 0, 0, 0);
  return date;
}

beforeAll(async () => {
  userA = await createTestUser(admin, "任意期間サマリーA");
});

afterAll(async () => {
  await deleteTestUser(admin, userA.id);
});

beforeEach(async () => {
  await admin.from("synced_events").delete().eq("user_id", userA.id);
  await admin.from("time_entries").delete().eq("user_id", userA.id);
  await admin.from("recurring_rules").delete().eq("user_id", userA.id);
});

describe("任意期間のデータ取得(S40・S41)", () => {
  it("S40: fetchSyncedEventsInRange は期間外の予定を返さない", async () => {
    const inRangeDay = addDays(NOW, -40);
    const outOfRangeDay = addDays(NOW, -80);
    await seedEvent(
      userA,
      "g-in",
      "期間内の予定",
      at(inRangeDay, 9),
      at(inRangeDay, 10),
    );
    await seedEvent(
      userA,
      "g-out",
      "期間外の予定",
      at(outOfRangeDay, 9),
      at(outOfRangeDay, 10),
    );

    const resolved = resolveSummaryRange(
      {
        range: "custom",
        from: formatDay(addDays(NOW, -50)),
        to: formatDay(addDays(NOW, -30)),
      },
      NOW,
    );
    const events = await fetchSyncedEventsInRange(
      userA.client,
      toSyncRange(resolved.range),
    );

    expect(events.map((event) => event.googleEventId)).toEqual(["g-in"]);
  });

  it("S41: fetchTimeEntriesInRange は期間外と実行中の実績を返さない", async () => {
    const inRangeDay = addDays(NOW, -40);
    const outOfRangeDay = addDays(NOW, -80);
    await seedEntry(
      userA,
      null,
      "期間内の実績",
      at(inRangeDay, 9),
      at(inRangeDay, 10),
    );
    await seedEntry(
      userA,
      null,
      "期間外の実績",
      at(outOfRangeDay, 9),
      at(outOfRangeDay, 10),
    );
    // 実行中タイマー(end_at IS NULL)は確定済み実績に含めない
    await seedEntry(userA, null, "実行中", at(inRangeDay, 11), null);

    const resolved = resolveSummaryRange(
      {
        range: "custom",
        from: formatDay(addDays(NOW, -50)),
        to: formatDay(addDays(NOW, -30)),
      },
      NOW,
    );
    const entries = await fetchTimeEntriesInRange(
      userA.client,
      toSyncRange(resolved.range),
    );

    expect(entries.map((entry) => entry.title)).toEqual(["期間内の実績"]);
  });
});

describe("任意期間での定期予定の実体化(S42〜S44)", () => {
  it("S42: 未実体化の過去期間でも、選択期間を渡せば定期予定が集計に載る", async () => {
    // 60日前を含む月を対象にする(既定の「今週±1週間」には含まれない)
    const targetDay = addDays(NOW, -60);
    const { error } = await admin.from("recurring_rules").insert({
      user_id: userA.id,
      title: "朝会",
      pattern: "daily",
      weekdays: null,
      start_time: "09:00",
      end_time: "09:30",
      timezone: "Asia/Tokyo",
      starts_on: formatDay(addDays(targetDay, -5)),
      ends_on: null,
    });
    expect(error).toBeNull();

    // 既定範囲(今週±1週間)だけでは対象期間に実体化されないことを確認する
    await materializeRecurringInstances(userA.client, NOW);
    const before = await fetchRuleRowsInRange(userA, targetDay);
    expect(before).toHaveLength(0);

    const resolved = resolveSummaryRange(
      {
        range: "custom",
        from: formatDay(addDays(targetDay, -3)),
        to: formatDay(addDays(targetDay, 3)),
      },
      NOW,
    );
    await materializeRecurringInstances(
      userA.client,
      NOW,
      toSyncRange(resolved.range),
    );

    const [planEvents, timeEntries, runningEntry] = await Promise.all([
      fetchSyncedEventsInRange(userA.client, toSyncRange(resolved.range)),
      fetchTimeEntriesInRange(userA.client, toSyncRange(resolved.range)),
      fetchRunningEntry(userA.client),
    ]);
    const summary = computeGapSummary(
      planEvents,
      actualBlockInputs(timeEntries, runningEntry, NOW),
      resolved.range,
    );

    expect(summary.planCount).toBe(7); // 7日間 × 毎日
    expect(summary.planTotalMinutes).toBe(7 * 30);
    expect(summary.items.every((item) => item.title === "朝会")).toBe(true);
  });

  it("S43: 同じ期間で2回実体化しても行が重複しない(冪等)", async () => {
    const targetDay = addDays(NOW, -60);
    await admin.from("recurring_rules").insert({
      user_id: userA.id,
      title: "朝会",
      pattern: "daily",
      weekdays: null,
      start_time: "09:00",
      end_time: "09:30",
      timezone: "Asia/Tokyo",
      starts_on: formatDay(addDays(targetDay, -5)),
      ends_on: null,
    });

    const resolved = resolveSummaryRange(
      {
        range: "custom",
        from: formatDay(addDays(targetDay, -3)),
        to: formatDay(addDays(targetDay, 3)),
      },
      NOW,
    );
    const syncRange = toSyncRange(resolved.range);
    await materializeRecurringInstances(userA.client, NOW, syncRange);
    const first = await fetchRuleRowsInRange(userA, targetDay);
    await materializeRecurringInstances(userA.client, NOW, syncRange);
    const second = await fetchRuleRowsInRange(userA, targetDay);

    expect(second.length).toBe(first.length);
  });

  it("S44: 第3引数を省略した既存呼び出しは従来どおり今週±1週間で実体化する(後方互換)", async () => {
    await admin.from("recurring_rules").insert({
      user_id: userA.id,
      title: "朝会",
      pattern: "daily",
      weekdays: null,
      start_time: "09:00",
      end_time: "09:30",
      timezone: "Asia/Tokyo",
      starts_on: formatDay(addDays(NOW, -400)),
      ends_on: null,
    });

    await materializeRecurringInstances(userA.client, NOW);

    const defaultRange = computeSyncRange(NOW);
    const { data } = await userA.client
      .from("synced_events")
      .select("start_at")
      .like("google_event_id", `${RECURRING_ID_PREFIX}%`);
    const rows = data ?? [];

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const startAt = new Date(row.start_at as string);
      expect(startAt.getTime()).toBeGreaterThanOrEqual(
        new Date(defaultRange.timeMin).getTime(),
      );
      expect(startAt.getTime()).toBeLessThan(
        new Date(defaultRange.timeMax).getTime(),
      );
    }
  });
});

/** "yyyy-MM-dd"(ローカル日付) */
function formatDay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** 対象日の前後4日に実体化された繰り返し予定の行 */
async function fetchRuleRowsInRange(user: TestUser, targetDay: Date) {
  const { data } = await user.client
    .from("synced_events")
    .select("id, google_event_id")
    .like("google_event_id", `${RECURRING_ID_PREFIX}%`)
    .gte("start_at", addDays(startOfDay(targetDay), -4).toISOString())
    .lt("start_at", addDays(startOfDay(targetDay), 4).toISOString());
  return data ?? [];
}
