import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addDays, startOfDay } from "date-fns";
import { fetchSyncedEventsInRange } from "@/lib/calendar/events";
import { computeGapSummary } from "@/lib/summary/aggregate";
import { resolveSummaryRange, toSyncRange } from "@/lib/summary/range";
import { fetchTimeEntriesInRange } from "@/lib/timer/entries";
import {
  createAdminClient,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "./helpers";

// 仕様書: docs/specs/P6-0_サマリー集計の行数上限.md S15〜S19
// PostgREST の max_rows(既定1000)による「無言の切り捨て」が起きないことを、
// ローカルSupabase+RLS経由で検証する。修正前は S15〜S19 が失敗する(Red)。

const admin = createAdminClient();
let userA: TestUser;
let userB: TestUser;

const NOW = new Date();

/** 上限1000を確実に超える件数。ページ境界(1000/1001件目)をまたぐ */
const SEED_COUNT = 1200;
/** 1件あたりの予定・実績の長さ(分)。S17の合計時間の期待値計算に使う */
const DURATION_MINUTES = 60;

/** 集計対象の期間。SEED_COUNT 件をこの期間内に収める */
const RANGE_FROM = addDays(NOW, -60);
const RANGE_TO = addDays(NOW, -20);

function resolvedRange() {
  return resolveSummaryRange(
    {
      range: "custom",
      from: formatDay(RANGE_FROM),
      to: formatDay(RANGE_TO),
    },
    NOW,
  );
}

/**
 * 期間内に収まる i 番目の開始時刻を返す。
 * 30件/日 × 40日 で SEED_COUNT を賄い、日付が期間の端に寄らないようにする。
 */
function nthStart(index: number): Date {
  const dayOffset = Math.floor(index / 30);
  const date = startOfDay(addDays(RANGE_FROM, dayOffset + 1));
  // 0:00〜14:30 の範囲に30分刻みで配置する(同日内で start_at が重複しない)
  const minutesFromMidnight = (index % 30) * 30;
  date.setHours(0, minutesFromMidnight, 0, 0);
  return date;
}

/** synced_events を件数ぶんまとめて投入する(500件ずつバッチ) */
async function seedEvents(
  user: TestUser,
  count: number,
  idPrefix: string,
  order: "asc" | "shuffled" = "asc",
): Promise<void> {
  const indexes = [...Array(count).keys()];
  if (order === "shuffled") {
    // 決定的なシャッフル(投入順と start_at 順を意図的にずらす)
    indexes.reverse();
    for (let i = 0; i < indexes.length; i += 3) {
      const tmp = indexes[i]!;
      indexes[i] = indexes[indexes.length - 1 - i]!;
      indexes[indexes.length - 1 - i] = tmp;
    }
  }
  const rows = indexes.map((index) => {
    const startAt = nthStart(index);
    return {
      user_id: user.id,
      google_event_id: `${idPrefix}-${index}`,
      title: `予定${index}`,
      start_at: startAt.toISOString(),
      end_at: new Date(
        startAt.getTime() + DURATION_MINUTES * 60_000,
      ).toISOString(),
      synced_at: new Date().toISOString(),
    };
  });
  for (let offset = 0; offset < rows.length; offset += 500) {
    const { error } = await admin
      .from("synced_events")
      .insert(rows.slice(offset, offset + 500));
    expect(error).toBeNull();
  }
}

/** time_entries を件数ぶんまとめて投入する(500件ずつバッチ) */
async function seedEntries(
  user: TestUser,
  count: number,
  googleEventIdPrefix: string | null,
): Promise<void> {
  const rows = [...Array(count).keys()].map((index) => {
    const startAt = nthStart(index);
    return {
      user_id: user.id,
      google_event_id: googleEventIdPrefix
        ? `${googleEventIdPrefix}-${index}`
        : null,
      title: `実績${index}`,
      start_at: startAt.toISOString(),
      end_at: new Date(
        startAt.getTime() + DURATION_MINUTES * 60_000,
      ).toISOString(),
    };
  });
  for (let offset = 0; offset < rows.length; offset += 500) {
    const { error } = await admin
      .from("time_entries")
      .insert(rows.slice(offset, offset + 500));
    expect(error).toBeNull();
  }
}

beforeAll(async () => {
  userA = await createTestUser(admin, "行数上限A");
  userB = await createTestUser(admin, "行数上限B");
});

afterAll(async () => {
  await deleteTestUser(admin, userA.id);
  await deleteTestUser(admin, userB.id);
});

beforeEach(async () => {
  for (const user of [userA, userB]) {
    await admin.from("synced_events").delete().eq("user_id", user.id);
    await admin.from("time_entries").delete().eq("user_id", user.id);
  }
});

describe("行数上限を超える期間の取得(S15〜S19)", () => {
  it("S15: fetchSyncedEventsInRange は1000件を超える予定をすべて返す", async () => {
    await seedEvents(userA, SEED_COUNT, "g");

    const events = await fetchSyncedEventsInRange(
      userA.client,
      toSyncRange(resolvedRange().range),
    );

    expect(events).toHaveLength(SEED_COUNT);
  });

  it("S16: fetchTimeEntriesInRange は1000件を超える実績をすべて返す", async () => {
    await seedEntries(userA, SEED_COUNT, null);

    const entries = await fetchTimeEntriesInRange(
      userA.client,
      toSyncRange(resolvedRange().range),
    );

    expect(entries).toHaveLength(SEED_COUNT);
  });

  it("S17: 1000件を超えても合計予定時間が過小にならない", async () => {
    await seedEvents(userA, SEED_COUNT, "g");

    const resolved = resolvedRange();
    const planEvents = await fetchSyncedEventsInRange(
      userA.client,
      toSyncRange(resolved.range),
    );
    const summary = computeGapSummary(planEvents, [], resolved.range);

    // 打ち切られていれば 1000 * 60 = 60000 分になる
    expect(summary.planCount).toBe(SEED_COUNT);
    expect(summary.planTotalMinutes).toBe(SEED_COUNT * DURATION_MINUTES);
  });

  it("S18: ページング取得がRLSを迂回しない(他ユーザーの行を返さない)", async () => {
    await seedEvents(userA, SEED_COUNT, "g-a");
    await seedEvents(userB, 10, "g-b");

    const events = await fetchSyncedEventsInRange(
      userB.client,
      toSyncRange(resolvedRange().range),
    );

    expect(events).toHaveLength(10);
    for (const event of events) {
      expect(event.googleEventId.startsWith("g-b-")).toBe(true);
    }
  });

  it("S19: ページ境界をまたいでも start_at 昇順が保たれる", async () => {
    await seedEvents(userA, SEED_COUNT, "g", "shuffled");

    const events = await fetchSyncedEventsInRange(
      userA.client,
      toSyncRange(resolvedRange().range),
    );

    expect(events).toHaveLength(SEED_COUNT);
    for (let i = 1; i < events.length; i += 1) {
      const previous = new Date(events[i - 1]!.startAt).getTime();
      const current = new Date(events[i]!.startAt).getTime();
      expect(previous).toBeLessThanOrEqual(current);
    }
  });

  it("S19: start_atが全件同値でも重複・欠落なく全件返る(ページ境界の一意性)", async () => {
    // start_at が同値だと LIMIT/OFFSET のページ間で順序が不定になり、
    // 第2ソートキーがなければ行の重複・欠落が起きる
    const sameStart = nthStart(0);
    const rows = [...Array(SEED_COUNT).keys()].map((index) => ({
      user_id: userA.id,
      google_event_id: `same-${index}`,
      title: `同時刻${index}`,
      start_at: sameStart.toISOString(),
      end_at: new Date(
        sameStart.getTime() + DURATION_MINUTES * 60_000,
      ).toISOString(),
      synced_at: new Date().toISOString(),
    }));
    for (let offset = 0; offset < rows.length; offset += 500) {
      const { error } = await admin
        .from("synced_events")
        .insert(rows.slice(offset, offset + 500));
      expect(error).toBeNull();
    }

    const events = await fetchSyncedEventsInRange(
      userA.client,
      toSyncRange(resolvedRange().range),
    );

    expect(events).toHaveLength(SEED_COUNT);
    // 重複なく全件が揃っていること
    expect(new Set(events.map((event) => event.googleEventId)).size).toBe(
      SEED_COUNT,
    );
  });
});

/** "yyyy-MM-dd"(ローカル日付) */
function formatDay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
