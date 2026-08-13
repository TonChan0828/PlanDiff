import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TZDate } from "@date-fns/tz";
import {
  applyRuleAdjustments,
  computeRuleAdjustments,
  disableRuleLearning,
} from "@/lib/calendar/rule-learning";
import {
  createRecurringRule,
  fetchRecurringRules,
  RECURRING_ID_PREFIX,
  type RecurringRuleFormInput,
} from "@/lib/calendar/recurring";
import type { TimeEntryItem } from "@/lib/timer/types";
import {
  createAdminClient,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "./helpers";

// 仕様書: docs/specs/P10-1_提案経由予定の学習補正.md T13〜T19, T19b
// 提案経由の定期予定(recurring_rules.origin='suggestion')の自動学習補正を、
// ローカルSupabaseで検証する。

const admin = createAdminClient();
let userA: TestUser;
let userB: TestUser;

const TZ = "Asia/Tokyo";
// 2026-08-13 12:00 JST。recurring-events.test.ts と異なり、実績の日付を固定してテストする
// (S21/S22のような「今日以降」境界の動的算出は不要。todayBoundaryの基準にnowを直接渡すため)
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

async function insertRuleDirect(
  user: TestUser,
  input: RecurringRuleFormInput,
  origin: "manual" | "suggestion",
  lastLearnedAt: string | null = null,
): Promise<string> {
  const { data, error } = await admin
    .from("recurring_rules")
    .insert({
      user_id: user.id,
      title: input.title,
      pattern: input.pattern,
      weekdays: input.weekdays,
      start_time: input.startTime,
      end_time: input.endTime,
      timezone: input.timezone,
      starts_on: input.startsOn,
      ends_on: input.endsOn,
      origin,
      last_learned_at: lastLearnedAt,
    })
    .select("id")
    .single();
  expect(error).toBeNull();
  return data!.id as string;
}

async function insertLinkedEntry(
  user: TestUser,
  ruleId: string,
  dateOnly: string,
  startHour: number,
  startMinute: number,
  durationMin: number,
) {
  const startAt = jstIso(dateOnly, startHour, startMinute);
  const endAt = new Date(
    new Date(startAt).getTime() + durationMin * 60_000,
  ).toISOString();
  const { error } = await admin.from("time_entries").insert({
    user_id: user.id,
    title: "朝会",
    google_event_id: `${RECURRING_ID_PREFIX}${ruleId}:${dateOnly}`,
    start_at: startAt,
    end_at: endAt,
  });
  expect(error).toBeNull();
}

async function insertSyncedEventDirect(
  user: TestUser,
  ruleId: string,
  dateOnly: string,
  startHour: number,
  startMinute: number,
) {
  const startAt = jstIso(dateOnly, startHour, startMinute);
  const endAt = new Date(
    new Date(startAt).getTime() + 30 * 60_000,
  ).toISOString();
  const { error } = await admin.from("synced_events").insert({
    user_id: user.id,
    source: "app",
    google_event_id: `${RECURRING_ID_PREFIX}${ruleId}:${dateOnly}`,
    title: "朝会",
    start_at: startAt,
    end_at: endAt,
  });
  expect(error).toBeNull();
}

async function fetchRuleRow(ruleId: string) {
  const { data, error } = await admin
    .from("recurring_rules")
    .select("id, origin, start_time, end_time, last_learned_at")
    .eq("id", ruleId)
    .single();
  expect(error).toBeNull();
  return data!;
}

async function fetchTimeEntriesFor(user: TestUser): Promise<TimeEntryItem[]> {
  const { data, error } = await user.client
    .from("time_entries")
    .select("id, title, google_event_id, start_at, end_at")
    .eq("user_id", user.id)
    .not("end_at", "is", null);
  expect(error).toBeNull();
  return (data ?? []).map((row) => ({
    id: row.id as string,
    title: row.title as string,
    googleEventId: row.google_event_id as string | null,
    startAt: new Date(row.start_at as string).toISOString(),
    endAt: new Date(row.end_at as string).toISOString(),
  }));
}

beforeAll(async () => {
  userA = await createTestUser(admin, "学習補正テストA");
  userB = await createTestUser(admin, "学習補正テストB");
});

afterAll(async () => {
  await deleteTestUser(admin, userA.id);
  await deleteTestUser(admin, userB.id);
});

beforeEach(async () => {
  await admin.from("synced_events").delete().eq("user_id", userA.id);
  await admin.from("synced_events").delete().eq("user_id", userB.id);
  await admin.from("time_entries").delete().eq("user_id", userA.id);
  await admin.from("time_entries").delete().eq("user_id", userB.id);
  await admin.from("recurring_exceptions").delete().eq("user_id", userA.id);
  await admin.from("recurring_exceptions").delete().eq("user_id", userB.id);
  await admin.from("recurring_rules").delete().eq("user_id", userA.id);
  await admin.from("recurring_rules").delete().eq("user_id", userB.id);
});

describe("学習補正の適用(T13/T14/T15)", () => {
  it("T13: origin='suggestion'+実績3件以上 Then start_time/end_time/last_learned_atが更新される", async () => {
    const ruleId = await insertRuleDirect(userA, BASE_INPUT, "suggestion");
    await insertLinkedEntry(userA, ruleId, "2026-07-06", 9, 15, 40);
    await insertLinkedEntry(userA, ruleId, "2026-07-13", 9, 15, 45);
    await insertLinkedEntry(userA, ruleId, "2026-07-20", 9, 15, 50);

    const rules = await fetchRecurringRules(userA.client);
    const entries = await fetchTimeEntriesFor(userA);
    const adjustments = computeRuleAdjustments(rules, entries, NOW);
    const notices = await applyRuleAdjustments(userA.client, adjustments, NOW);

    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      ruleId,
      previousStartTime: "09:00",
      previousEndTime: "09:30",
      newStartTime: "09:15",
      newEndTime: "10:00",
    });

    const row = await fetchRuleRow(ruleId);
    expect(row.start_time).toBe("09:15:00");
    expect(row.end_time).toBe("10:00:00");
    expect(row.last_learned_at).not.toBeNull();
  });

  it("T14: 調整あり Then 今日以降のsynced_eventsのみ削除され過去の行は残る", async () => {
    const ruleId = await insertRuleDirect(userA, BASE_INPUT, "suggestion");
    await insertLinkedEntry(userA, ruleId, "2026-07-06", 9, 15, 45);
    await insertLinkedEntry(userA, ruleId, "2026-07-13", 9, 15, 45);
    await insertLinkedEntry(userA, ruleId, "2026-07-20", 9, 15, 45);
    // 過去(NOWより前)の実体化済み行
    await insertSyncedEventDirect(userA, ruleId, "2026-08-06", 9, 0);
    // 今日以降(NOW=2026-08-13)の実体化済み行
    await insertSyncedEventDirect(userA, ruleId, "2026-08-20", 9, 0);

    const rules = await fetchRecurringRules(userA.client);
    const entries = await fetchTimeEntriesFor(userA);
    const adjustments = computeRuleAdjustments(rules, entries, NOW);
    await applyRuleAdjustments(userA.client, adjustments, NOW);

    const { data: remaining } = await admin
      .from("synced_events")
      .select("google_event_id")
      .eq("user_id", userA.id)
      .eq("source", "app");
    const remainingIds = (remaining ?? []).map((r) => r.google_event_id);
    expect(remainingIds).toContain(
      `${RECURRING_ID_PREFIX}${ruleId}:2026-08-06`,
    );
    expect(remainingIds).not.toContain(
      `${RECURRING_ID_PREFIX}${ruleId}:2026-08-20`,
    );
  });

  it("T15: 調整あり Then recurring_exceptionsは変更されない", async () => {
    const ruleId = await insertRuleDirect(userA, BASE_INPUT, "suggestion");
    await insertLinkedEntry(userA, ruleId, "2026-07-06", 9, 15, 45);
    await insertLinkedEntry(userA, ruleId, "2026-07-13", 9, 15, 45);
    await insertLinkedEntry(userA, ruleId, "2026-07-20", 9, 15, 45);
    const { error: exceptionError } = await admin
      .from("recurring_exceptions")
      .insert({
        rule_id: ruleId,
        user_id: userA.id,
        occurrence_date: "2026-08-20",
      });
    expect(exceptionError).toBeNull();

    const rules = await fetchRecurringRules(userA.client);
    const entries = await fetchTimeEntriesFor(userA);
    const adjustments = computeRuleAdjustments(rules, entries, NOW);
    await applyRuleAdjustments(userA.client, adjustments, NOW);

    const { data: exceptions } = await admin
      .from("recurring_exceptions")
      .select("occurrence_date")
      .eq("rule_id", ruleId);
    expect(exceptions).toHaveLength(1);
    expect(exceptions![0]!.occurrence_date).toBe("2026-08-20");
  });
});

describe("origin='manual'は対象外(T16)", () => {
  it("T16: origin='manual'のルール Then computeRuleAdjustmentsの対象に含まれず更新されない", async () => {
    const ruleId = await insertRuleDirect(userA, BASE_INPUT, "manual");
    await insertLinkedEntry(userA, ruleId, "2026-07-06", 9, 15, 45);
    await insertLinkedEntry(userA, ruleId, "2026-07-13", 9, 15, 45);
    await insertLinkedEntry(userA, ruleId, "2026-07-20", 9, 15, 45);

    const rules = await fetchRecurringRules(userA.client);
    const entries = await fetchTimeEntriesFor(userA);
    const adjustments = computeRuleAdjustments(rules, entries, NOW);

    expect(adjustments.find((a) => a.ruleId === ruleId)).toBeUndefined();

    await applyRuleAdjustments(userA.client, adjustments, NOW);
    const row = await fetchRuleRow(ruleId);
    expect(row.start_time).toBe("09:00:00");
    expect(row.end_time).toBe("09:30:00");
    expect(row.last_learned_at).toBeNull();
  });
});

describe("他ユーザーのルールは対象外(T17)", () => {
  it("T17: 他ユーザーのrecurring_rules Then fetchRecurringRulesで取得されない(RLS)", async () => {
    const ruleIdB = await insertRuleDirect(userB, BASE_INPUT, "suggestion");
    await insertLinkedEntry(userB, ruleIdB, "2026-07-06", 9, 15, 45);
    await insertLinkedEntry(userB, ruleIdB, "2026-07-13", 9, 15, 45);
    await insertLinkedEntry(userB, ruleIdB, "2026-07-20", 9, 15, 45);

    const rulesForA = await fetchRecurringRules(userA.client);

    expect(rulesForA.find((r) => r.id === ruleIdB)).toBeUndefined();
  });
});

describe("originのセット(T18/T19)", () => {
  it("T18: 提案由来(makeWeekly相当)でcreateRecurringRule Then originが'suggestion'で作成される", async () => {
    const result = await createRecurringRule(userA.client, {
      ...BASE_INPUT,
      origin: "suggestion",
    });
    expect(result.ok).toBe(true);

    const { data: rows } = await userA.client
      .from("recurring_rules")
      .select("id, origin")
      .eq("user_id", userA.id);
    expect(rows).toHaveLength(1);
    expect(rows![0]!.origin).toBe("suggestion");
  });

  it("T19: 手動作成(origin省略)でcreateRecurringRule Then originは'manual'(既定)のまま", async () => {
    const result = await createRecurringRule(userA.client, BASE_INPUT);
    expect(result.ok).toBe(true);

    const { data: rows } = await userA.client
      .from("recurring_rules")
      .select("id, origin")
      .eq("user_id", userA.id);
    expect(rows).toHaveLength(1);
    expect(rows![0]!.origin).toBe("manual");
  });
});

describe("学習停止トグルの反映(T19b)", () => {
  it("T19b: origin='suggestion'のルール When disableRuleLearning Then originが'manual'に更新される", async () => {
    const ruleId = await insertRuleDirect(userA, BASE_INPUT, "suggestion");

    const result = await disableRuleLearning(userA.client, ruleId);

    expect(result.ok).toBe(true);
    const row = await fetchRuleRow(ruleId);
    expect(row.origin).toBe("manual");
  });

  it("T19b: 他ユーザーのルールIDを渡した場合 Then RLSによりok:falseでoriginは変化しない", async () => {
    const ruleIdA = await insertRuleDirect(userA, BASE_INPUT, "suggestion");

    const result = await disableRuleLearning(userB.client, ruleIdA);

    expect(result.ok).toBe(false);
    const row = await fetchRuleRow(ruleIdA);
    expect(row.origin).toBe("suggestion");
  });
});
