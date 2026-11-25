import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TZDate } from "@date-fns/tz";
import {
  fetchRecurringRules,
  materializeRecurringInstances,
  RECURRING_ID_PREFIX,
  type RecurringRuleFormInput,
} from "@/lib/calendar/recurring";
import { updateAppEvent } from "@/lib/calendar/app-events";
import {
  prepareRecurringEvents,
  rematerializeAdjustedRules,
} from "@/lib/calendar/recurring-sync";
import {
  applyRuleAdjustments,
  computeRuleAdjustments,
} from "@/lib/calendar/rule-learning";
import type { TimeEntryItem } from "@/lib/timer/types";
import {
  createAdminClient,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "./helpers";

// 仕様書: docs/specs/G-112_カレンダー表示と定期予定更新処理の境界.md B8〜B12
// 定期予定の実体化・自動調整・再実体化が、同時表示や再試行でも整合することを、ローカルSupabaseで検証する。

const admin = createAdminClient();
let userA: TestUser;
let userB: TestUser;

const TZ = "Asia/Tokyo";
// 2026-08-13(木)12:00 JST。rule-learning.test.ts と同じく、実行時刻に依存させない
const NOW = new Date(new TZDate(2026, 7, 13, 12, 0, 0, TZ).getTime());

const BASE_INPUT: RecurringRuleFormInput = {
  title: "朝会",
  pattern: "weekly",
  weekdays: [1, 2, 3, 4, 5],
  startTime: "09:00",
  endTime: "09:30",
  timezone: TZ,
  startsOn: "2026-01-01",
  endsOn: null,
};

function jstIso(dateOnly: string, hour: number, minute: number): string {
  const [year, month, day] = dateOnly.split("-").map(Number);
  return new Date(
    new TZDate(year!, month! - 1, day!, hour, minute, 0, TZ).getTime(),
  ).toISOString();
}

async function insertRule(
  user: TestUser,
  startTime = BASE_INPUT.startTime,
  endTime = BASE_INPUT.endTime,
): Promise<string> {
  const { data, error } = await admin
    .from("recurring_rules")
    .insert({
      user_id: user.id,
      title: BASE_INPUT.title,
      pattern: BASE_INPUT.pattern,
      weekdays: BASE_INPUT.weekdays,
      start_time: startTime,
      end_time: endTime,
      timezone: BASE_INPUT.timezone,
      starts_on: BASE_INPUT.startsOn,
      ends_on: BASE_INPUT.endsOn,
      origin: "manual",
      auto_adjust_enabled: true,
    })
    .select("id")
    .single();
  expect(error).toBeNull();
  return data!.id as string;
}

/** 指定の開始時刻・45分の実績を3回分入れる(既定は 09:15 開始 → 09:15〜10:00 への調整が出る) */
async function insertLearningEntries(
  user: TestUser,
  ruleId: string,
  hour = 9,
  minute = 15,
) {
  for (const date of ["2026-07-06", "2026-07-13", "2026-07-20"]) {
    const startAt = jstIso(date, hour, minute);
    const { error } = await admin.from("time_entries").insert({
      user_id: user.id,
      title: "朝会",
      google_event_id: `${RECURRING_ID_PREFIX}${ruleId}:${date}`,
      start_at: startAt,
      end_at: new Date(new Date(startAt).getTime() + 45 * 60_000).toISOString(),
    });
    expect(error).toBeNull();
  }
}

async function ruleEventRows(ruleId: string) {
  const { data, error } = await admin
    .from("synced_events")
    .select("google_event_id, start_at, end_at")
    .eq("source", "app")
    .like("google_event_id", `${RECURRING_ID_PREFIX}${ruleId}:%`)
    .order("start_at", { ascending: true });
  expect(error).toBeNull();
  return (data ?? []).map((r) => ({
    id: r.google_event_id as string,
    startAt: new Date(r.start_at as string).toISOString(),
  }));
}

async function fetchEntries(user: TestUser): Promise<TimeEntryItem[]> {
  const { data } = await user.client
    .from("time_entries")
    .select("id, title, google_event_id, start_at, end_at")
    .eq("user_id", user.id)
    .not("end_at", "is", null);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    title: row.title as string,
    googleEventId: row.google_event_id as string | null,
    startAt: new Date(row.start_at as string).toISOString(),
    endAt: new Date(row.end_at as string).toISOString(),
  }));
}

const NEW_START_UTC_HOUR_MINUTE = "00:15"; // 09:15 JST
const OLD_START_UTC_HOUR_MINUTE = "00:00"; // 09:00 JST
const hhmmUtc = (iso: string) => iso.slice(11, 16);
const isFuture = (iso: string) => new Date(iso).getTime() >= NOW.getTime();

beforeAll(async () => {
  userA = await createTestUser(admin, "同期A");
  userB = await createTestUser(admin, "同期B");
});

afterAll(async () => {
  await deleteTestUser(admin, userA.id);
  await deleteTestUser(admin, userB.id);
});

beforeEach(async () => {
  for (const user of [userA, userB]) {
    await admin.from("synced_events").delete().eq("user_id", user.id);
    await admin.from("time_entries").delete().eq("user_id", user.id);
    await admin.from("recurring_exceptions").delete().eq("user_id", user.id);
    await admin.from("recurring_rules").delete().eq("user_id", user.id);
  }
});

describe("定期予定の準備(G-112)", () => {
  it("B8: 同じ期間を同時に2回表示しても、調整は1回だけ適用され、今日以降の予定は新しい時刻にそろう", async () => {
    const ruleId = await insertRule(userA);
    await insertLearningEntries(userA, ruleId);

    const [first, second] = await Promise.all([
      prepareRecurringEvents(userA.client, { baseDate: NOW, now: NOW }),
      prepareRecurringEvents(userA.client, { baseDate: NOW, now: NOW }),
    ]);

    // 調整の通知は、実際に適用した側にだけ出る
    expect(first.ruleAdjustments.length + second.ruleAdjustments.length).toBe(
      1,
    );
    const { data: rule } = await admin
      .from("recurring_rules")
      .select("start_time, end_time")
      .eq("id", ruleId)
      .single();
    expect(rule!.start_time).toBe("09:15:00");
    expect(rule!.end_time).toBe("10:00:00");
    const rows = await ruleEventRows(ruleId);
    const future = rows.filter((r) => isFuture(r.startAt));
    expect(future.length).toBeGreaterThan(0);
    expect(future.map((r) => hhmmUtc(r.startAt))).toEqual(
      future.map(() => NEW_START_UTC_HOUR_MINUTE),
    );
    // 同じ回が重複していない
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });

  it("B9: 調整後に同じ表示をもう一度行っても、何も変わらない(冪等)", async () => {
    const ruleId = await insertRule(userA);
    await insertLearningEntries(userA, ruleId);
    await prepareRecurringEvents(userA.client, { baseDate: NOW, now: NOW });
    const before = await ruleEventRows(ruleId);

    const again = await prepareRecurringEvents(userA.client, {
      baseDate: NOW,
      now: NOW,
    });

    expect(again.ruleAdjustments).toEqual([]);
    expect(await ruleEventRows(ruleId)).toEqual(before);
  });

  it("B10: 調整の削除のあとに、調整前のルールで実体化されても、再実体化で今日以降が新しい時刻にそろう", async () => {
    const ruleId = await insertRule(userA);
    await insertLearningEntries(userA, ruleId);
    await materializeRecurringInstances(userA.client, NOW);
    // リクエストB: 調整前のルールを読み取る(その後、A が調整する)
    const staleRules = await fetchRecurringRules(userA.client);
    // リクエストA: 調整して、今日以降の予定を削除する
    const adjustments = await applyRuleAdjustments(
      userA.client,
      computeRuleAdjustments(
        await fetchRecurringRules(userA.client),
        await fetchEntries(userA),
        NOW,
      ),
      NOW,
    );
    expect(adjustments).toHaveLength(1);
    // リクエストB: A の削除のあとに、調整前のルールで実体化する(古い時刻の行が入り直る)
    await materializeRecurringInstances(
      userA.client,
      NOW,
      undefined,
      staleRules,
    );
    expect(
      (await ruleEventRows(ruleId))
        .filter((r) => isFuture(r.startAt))
        .map((r) => hhmmUtc(r.startAt)),
    ).toContain(OLD_START_UTC_HOUR_MINUTE);

    // リクエストA: 調整結果で再実体化する
    await rematerializeAdjustedRules(userA.client, {
      baseDate: NOW,
      now: NOW,
      rules: staleRules,
      adjustments,
    });

    const future = (await ruleEventRows(ruleId)).filter((r) =>
      isFuture(r.startAt),
    );
    expect(future.length).toBeGreaterThan(0);
    expect(future.map((r) => hhmmUtc(r.startAt))).toEqual(
      future.map(() => NEW_START_UTC_HOUR_MINUTE),
    );
  });

  it("B11: 過去(今日より前)の予定は、調整でも再実体化でも変わらない", async () => {
    const ruleId = await insertRule(userA);
    await insertLearningEntries(userA, ruleId);
    await materializeRecurringInstances(userA.client, NOW);
    const pastBefore = (await ruleEventRows(ruleId)).filter(
      (r) => !isFuture(r.startAt),
    );
    expect(pastBefore.length).toBeGreaterThan(0);

    await prepareRecurringEvents(userA.client, { baseDate: NOW, now: NOW });

    const pastAfter = (await ruleEventRows(ruleId)).filter(
      (r) => !isFuture(r.startAt),
    );
    expect(pastAfter).toEqual(pastBefore);
    expect(pastAfter.map((r) => hhmmUtc(r.startAt))).toEqual(
      pastAfter.map(() => OLD_START_UTC_HOUR_MINUTE),
    );
  });

  it("B12: 他ユーザーのルールと予定は、読み書きされない", async () => {
    const ruleA = await insertRule(userA);
    const ruleB = await insertRule(userB);
    await insertLearningEntries(userA, ruleA);
    await insertLearningEntries(userB, ruleB);

    await prepareRecurringEvents(userA.client, { baseDate: NOW, now: NOW });

    const { data: rowB } = await admin
      .from("recurring_rules")
      .select("start_time")
      .eq("id", ruleB)
      .single();
    expect(rowB!.start_time).toBe("09:00:00");
    expect(await ruleEventRows(ruleB)).toEqual([]);
  });

  it("B13: 開始済みの回を個別編集していた場合、調整後の再実体化でその内容を上書きしない", async () => {
    // 09:05 JST。今日の回(09:00 開始)はすでに始まっている
    const now = new Date(new TZDate(2026, 7, 13, 9, 5, 0, TZ).getTime());
    const ruleId = await insertRule(userA);
    await insertLearningEntries(userA, ruleId);
    await materializeRecurringInstances(userA.client, now);
    const todayId = `${RECURRING_ID_PREFIX}${ruleId}:2026-08-13`;
    const { data: todayRow } = await admin
      .from("synced_events")
      .select("id")
      .eq("google_event_id", todayId)
      .single();
    // 「この予定のみ」の編集(updateAppEvent は rec: の行も更新できる)
    const edited = await updateAppEvent(userA.client, todayRow!.id as string, {
      title: "個別に編集した朝会",
      startAt: jstIso("2026-08-13", 8, 0),
      endAt: jstIso("2026-08-13", 8, 20),
    });
    expect(edited.ok).toBe(true);

    const result = await prepareRecurringEvents(userA.client, {
      baseDate: now,
      now,
    });

    expect(result.ruleAdjustments).toHaveLength(1);
    const { data: after } = await admin
      .from("synced_events")
      .select("title, start_at")
      .eq("google_event_id", todayId)
      .single();
    expect(after!.title).toBe("個別に編集した朝会");
    expect(new Date(after!.start_at as string).toISOString()).toBe(
      jstIso("2026-08-13", 8, 0),
    );
  });

  it("B14: 調整で開始が現在より前に早まる場合も、調整前の時刻で入り直した今日の行が新しい時刻にそろう", async () => {
    // 09:10 JST。調整前の今日の回(09:15)はまだ始まっておらず、調整後(09:00)は過去になる
    const now = new Date(new TZDate(2026, 7, 13, 9, 10, 0, TZ).getTime());
    const ruleId = await insertRule(userA, "09:15", "10:00");
    await insertLearningEntries(userA, ruleId, 9, 0);
    await materializeRecurringInstances(userA.client, now);
    const staleRules = await fetchRecurringRules(userA.client);
    const adjustments = await applyRuleAdjustments(
      userA.client,
      computeRuleAdjustments(
        await fetchRecurringRules(userA.client),
        await fetchEntries(userA),
        now,
      ),
      now,
    );
    expect(adjustments).toHaveLength(1);
    // 別リクエストが、調整前のルールで今日の 09:15 の行を入れ直す
    await materializeRecurringInstances(
      userA.client,
      now,
      undefined,
      staleRules,
    );

    await rematerializeAdjustedRules(userA.client, {
      baseDate: now,
      now,
      rules: staleRules,
      adjustments,
    });

    const todayRow = (await ruleEventRows(ruleId)).find((r) =>
      r.id.endsWith(":2026-08-13"),
    );
    expect(todayRow).toBeDefined();
    expect(hhmmUtc(todayRow!.startAt)).toBe("00:00"); // 09:00 JST
  });
});
