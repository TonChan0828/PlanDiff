import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TZDate } from "@date-fns/tz";
import {
  createRecurringRule,
  deleteRecurringOccurrence,
  deleteRecurringRule,
  materializeRecurringInstances,
  updateRecurringRule,
  RECURRING_ID_PREFIX,
  type RecurringRuleFormInput,
} from "@/lib/calendar/recurring";
import {
  createAdminClient,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "./helpers";

// 仕様書: docs/specs/P5-1_定期予定.md S17〜S24
// 繰り返し予定のルールCRUD・実体化・RLSを、ローカルSupabaseで検証する

const admin = createAdminClient();
let userA: TestUser;
let userB: TestUser;

const DAILY_INPUT: RecurringRuleFormInput = {
  title: "朝会",
  pattern: "daily",
  weekdays: null,
  startTime: "09:00",
  endTime: "09:30",
  timezone: "Asia/Tokyo",
  startsOn: "2026-07-01",
  endsOn: null,
};

// materializeRecurringInstances は「表示中の週 ± 1週間」を対象にするため、
// 基準日をルールのstarts_on付近に取ることで対象範囲に発生を含める
const BASE_DATE = new Date("2026-07-08T00:00:00.000Z");

// S21/S22は「今日以降/より前」の境界(実行時の実際の現在時刻基準)を検証するため、
// テスト実行時点から動的に日付を算出する(ハードコードした年だと実行日によって
// 「今日」の境界とずれてしまい、期待する過去/未来の分割が崩れるため)
function ymdInTimeZone(date: Date, timeZone: string): string {
  const zoned = new TZDate(date, timeZone);
  const year = zoned.getFullYear();
  const month = String(zoned.getMonth() + 1).padStart(2, "0");
  const day = String(zoned.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function jstTimeToUtcIso(
  dateOnly: string,
  hour: number,
  minute: number,
): string {
  const [year, month, day] = dateOnly.split("-").map(Number);
  const zoned = new TZDate(
    year!,
    month! - 1,
    day!,
    hour,
    minute,
    0,
    "Asia/Tokyo",
  );
  return new Date(zoned.getTime()).toISOString();
}

const NOW = new Date();
// 実行時点から見て確実に「未来」になる基準日(60日後)。この週±1週間の実体化結果は
// すべて「今日」より後になるため、今日以降削除の対象になる
const FUTURE_BASE_DATE = new Date(NOW.getTime() + 60 * 24 * 60 * 60 * 1000);
const YESTERDAY_DATE_ONLY = ymdInTimeZone(
  new Date(NOW.getTime() - 24 * 60 * 60 * 1000),
  "Asia/Tokyo",
);

async function fetchRuleEventRows(user: TestUser, ruleId: string) {
  const { data, error } = await user.client
    .from("synced_events")
    .select("id, google_event_id, title, start_at, end_at")
    .eq("source", "app")
    .like("google_event_id", `${RECURRING_ID_PREFIX}${ruleId}:%`)
    .order("start_at", { ascending: true });
  expect(error).toBeNull();
  return data ?? [];
}

async function insertRuleDirect(user: TestUser, input: RecurringRuleFormInput) {
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
    })
    .select("id")
    .single();
  expect(error).toBeNull();
  return data!.id as string;
}

beforeAll(async () => {
  userA = await createTestUser(admin, "定期予定テストA");
  userB = await createTestUser(admin, "定期予定テストB");
});

afterAll(async () => {
  await deleteTestUser(admin, userA.id);
  await deleteTestUser(admin, userB.id);
});

beforeEach(async () => {
  await admin.from("synced_events").delete().eq("user_id", userA.id);
  await admin.from("synced_events").delete().eq("user_id", userB.id);
  await admin.from("recurring_rules").delete().eq("user_id", userA.id);
  await admin.from("recurring_rules").delete().eq("user_id", userB.id);
});

describe("繰り返しルールの作成と実体化(S17)", () => {
  it("S17: createRecurringRuleで作成したルールが実体化で範囲日数分のsynced_events行になる", async () => {
    const createResult = await createRecurringRule(userA.client, DAILY_INPUT);
    expect(createResult.ok).toBe(true);

    const { data: rules } = await userA.client
      .from("recurring_rules")
      .select("id")
      .eq("user_id", userA.id);
    const ruleId = rules![0]!.id as string;

    await materializeRecurringInstances(userA.client, BASE_DATE);

    const rows = await fetchRuleEventRows(userA, ruleId);
    // 表示範囲(基準日の週±1週間=3週間=21日)のうち、starts_on(07-01)以降の日数分
    expect(rows.length).toBeGreaterThan(0);
    const idPattern = new RegExp(
      `^${RECURRING_ID_PREFIX}${ruleId}:\\d{4}-\\d{2}-\\d{2}$`,
    );
    expect(
      rows.every((row) => idPattern.test(row.google_event_id as string)),
    ).toBe(true);
    expect(rows.every((row) => row.title === "朝会")).toBe(true);
  });
});

describe("実体化の冪等性(S18)", () => {
  it("S18: 同じ週で再実体化しても行数・値が変わらない", async () => {
    await createRecurringRule(userA.client, DAILY_INPUT);
    const { data: rules } = await userA.client
      .from("recurring_rules")
      .select("id")
      .eq("user_id", userA.id);
    const ruleId = rules![0]!.id as string;

    await materializeRecurringInstances(userA.client, BASE_DATE);
    const firstPass = await fetchRuleEventRows(userA, ruleId);

    await materializeRecurringInstances(userA.client, BASE_DATE);
    const secondPass = await fetchRuleEventRows(userA, ruleId);

    expect(secondPass).toHaveLength(firstPass.length);
    expect(secondPass.map((r) => r.start_at)).toEqual(
      firstPass.map((r) => r.start_at),
    );
  });
});

describe("個別編集の保持(S19)", () => {
  it("S19: 実体化済み行を直接編集してから再実体化しても上書きされない", async () => {
    await createRecurringRule(userA.client, DAILY_INPUT);
    const { data: rules } = await userA.client
      .from("recurring_rules")
      .select("id")
      .eq("user_id", userA.id);
    const ruleId = rules![0]!.id as string;

    await materializeRecurringInstances(userA.client, BASE_DATE);
    const [firstRow] = await fetchRuleEventRows(userA, ruleId);

    const { error: updateError } = await userA.client
      .from("synced_events")
      .update({ title: "朝会(延長)" })
      .eq("id", firstRow!.id);
    expect(updateError).toBeNull();

    await materializeRecurringInstances(userA.client, BASE_DATE);
    const rowsAfter = await fetchRuleEventRows(userA, ruleId);
    const editedRow = rowsAfter.find((r) => r.id === firstRow!.id);

    expect(editedRow!.title).toBe("朝会(延長)");
  });
});

describe("この回のみ削除(S20)", () => {
  it("S20: deleteRecurringOccurrenceで削除した日は再実体化しても復活しない", async () => {
    await createRecurringRule(userA.client, DAILY_INPUT);
    await materializeRecurringInstances(userA.client, BASE_DATE);
    const { data: rules } = await userA.client
      .from("recurring_rules")
      .select("id")
      .eq("user_id", userA.id);
    const ruleId = rules![0]!.id as string;
    const before = await fetchRuleEventRows(userA, ruleId);
    const target = before[2]!;

    const result = await deleteRecurringOccurrence(
      userA.client,
      target.id as string,
    );
    expect(result.ok).toBe(true);

    await materializeRecurringInstances(userA.client, BASE_DATE);
    const after = await fetchRuleEventRows(userA, ruleId);

    expect(after.some((r) => r.id === target.id)).toBe(false);
    expect(after).toHaveLength(before.length - 1);
  });
});

describe("繰り返し全体の編集(S21)", () => {
  it("S21: updateRecurringRuleで時刻変更すると未来分は再生成され過去分は残る", async () => {
    const created = await createRecurringRule(userA.client, DAILY_INPUT);
    expect(created.ok).toBe(true);
    const { data: rules } = await userA.client
      .from("recurring_rules")
      .select("id")
      .eq("user_id", userA.id);
    const ruleId = rules![0]!.id as string;

    // 「今日」より前(昨日)の実体化済み行を直接1件作っておく(過去分の代わり)
    const pastEventId = `${RECURRING_ID_PREFIX}${ruleId}:${YESTERDAY_DATE_ONLY}`;
    const pastStartAt = jstTimeToUtcIso(YESTERDAY_DATE_ONLY, 9, 0);
    const pastEndAt = jstTimeToUtcIso(YESTERDAY_DATE_ONLY, 9, 30);
    await admin.from("synced_events").insert({
      user_id: userA.id,
      source: "app",
      google_event_id: pastEventId,
      title: "朝会",
      start_at: pastStartAt,
      end_at: pastEndAt,
    });

    // 実行時点から見て確実に未来の範囲を実体化する(未来分の代わり)
    await materializeRecurringInstances(userA.client, FUTURE_BASE_DATE);
    const beforeUpdate = await fetchRuleEventRows(userA, ruleId);
    expect(beforeUpdate.some((r) => r.google_event_id === pastEventId)).toBe(
      true,
    );
    expect(beforeUpdate.length).toBeGreaterThan(1);

    const updateResult = await updateRecurringRule(userA.client, ruleId, {
      ...DAILY_INPUT,
      startTime: "10:00",
      endTime: "10:30",
    });
    expect(updateResult.ok).toBe(true);

    const afterDelete = await fetchRuleEventRows(userA, ruleId);
    // 過去(昨日)の行はupdateRecurringRuleの削除対象(start_at >= 今日)に含まれず残る
    expect(afterDelete).toHaveLength(1);
    expect(afterDelete[0]!.google_event_id).toBe(pastEventId);
    expect(new Date(afterDelete[0]!.start_at).toISOString()).toBe(pastStartAt);

    await materializeRecurringInstances(userA.client, FUTURE_BASE_DATE);
    const afterRematerialize = await fetchRuleEventRows(userA, ruleId);
    const futureRow = afterRematerialize.find(
      (r) => r.google_event_id !== pastEventId,
    );
    expect(futureRow).toBeDefined();
    // 新時刻(JST 10:00 = UTC 01:00)が反映されている
    expect(new Date(futureRow!.start_at).getUTCHours()).toBe(1);
  });
});

describe("繰り返し全体の削除(S22)", () => {
  it("S22: deleteRecurringRuleでルールと未来分が消え、過去分は残る", async () => {
    const created = await createRecurringRule(userA.client, DAILY_INPUT);
    expect(created.ok).toBe(true);
    const { data: rules } = await userA.client
      .from("recurring_rules")
      .select("id")
      .eq("user_id", userA.id);
    const ruleId = rules![0]!.id as string;

    const pastEventId = `${RECURRING_ID_PREFIX}${ruleId}:${YESTERDAY_DATE_ONLY}`;
    await admin.from("synced_events").insert({
      user_id: userA.id,
      source: "app",
      google_event_id: pastEventId,
      title: "朝会",
      start_at: jstTimeToUtcIso(YESTERDAY_DATE_ONLY, 9, 0),
      end_at: jstTimeToUtcIso(YESTERDAY_DATE_ONLY, 9, 30),
    });
    await materializeRecurringInstances(userA.client, FUTURE_BASE_DATE);
    const beforeDelete = await fetchRuleEventRows(userA, ruleId);
    expect(beforeDelete.length).toBeGreaterThan(1);

    const result = await deleteRecurringRule(userA.client, ruleId);
    expect(result.ok).toBe(true);

    const { data: ruleAfter } = await admin
      .from("recurring_rules")
      .select("id")
      .eq("id", ruleId);
    expect(ruleAfter).toHaveLength(0);

    const remaining = await fetchRuleEventRows(userA, ruleId);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.google_event_id).toBe(pastEventId);
  });
});

describe("RLS(S23)", () => {
  it("S23: 他ユーザーのルールidはupdateRecurringRule/deleteRecurringRuleで変更されない", async () => {
    const ruleId = await insertRuleDirect(userA, DAILY_INPUT);

    const updateResult = await updateRecurringRule(userB.client, ruleId, {
      ...DAILY_INPUT,
      title: "乗っ取り",
    });
    const deleteResult = await deleteRecurringRule(userB.client, ruleId);

    expect(updateResult.ok).toBe(false);
    expect(deleteResult.ok).toBe(false);
    const { data: stillThere } = await admin
      .from("recurring_rules")
      .select("title")
      .eq("id", ruleId)
      .single();
    expect(stillThere!.title).toBe("朝会");
  });
});

describe("非rec予定でのdeleteRecurringOccurrence(S24)", () => {
  it("S24: app:(非rec)の予定idはexceptionsに記録されず行も消えない", async () => {
    const { data: appEvent, error } = await admin
      .from("synced_events")
      .insert({
        user_id: userA.id,
        source: "app",
        google_event_id: `app:${crypto.randomUUID()}`,
        title: "単発予定",
        start_at: "2026-07-10T01:00:00.000Z",
        end_at: "2026-07-10T02:00:00.000Z",
      })
      .select("id")
      .single();
    expect(error).toBeNull();

    const result = await deleteRecurringOccurrence(
      userA.client,
      appEvent!.id as string,
    );

    expect(result.ok).toBe(false);
    const { data: exceptions } = await admin
      .from("recurring_exceptions")
      .select("id")
      .eq("user_id", userA.id);
    expect(exceptions).toHaveLength(0);
    const { data: stillThere } = await admin
      .from("synced_events")
      .select("id")
      .eq("id", appEvent!.id);
    expect(stillThere).toHaveLength(1);
  });
});
