import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  updateRecurringRule,
  RECURRING_ID_PREFIX,
  type RecurringRuleFormInput,
} from "@/lib/calendar/recurring";
import {
  createAdminClient,
  createAnonClient,
  createDbSql,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "./helpers";

// 仕様書: docs/specs/G-108_定期予定編集のトランザクション化.md T1〜T8
// ルール更新と「今日以降の予定・例外の削除」が、全部成功か全部取り消しのどちらかになることを検証する

const admin = createAdminClient();
const sql = createDbSql();
let userA: TestUser;
let userB: TestUser;

const INPUT: RecurringRuleFormInput = {
  title: "朝会",
  pattern: "daily",
  weekdays: null,
  startTime: "09:00",
  endTime: "09:30",
  timezone: "UTC",
  startsOn: "2026-01-01",
  endsOn: null,
};

const DAY_MS = 86_400_000;
const dateOnly = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);

async function insertRule(user: TestUser): Promise<string> {
  const { data, error } = await admin
    .from("recurring_rules")
    .insert({
      user_id: user.id,
      title: INPUT.title,
      pattern: INPUT.pattern,
      weekdays: INPUT.weekdays,
      start_time: INPUT.startTime,
      end_time: INPUT.endTime,
      timezone: INPUT.timezone,
      starts_on: INPUT.startsOn,
      ends_on: INPUT.endsOn,
      inactivity_since: "2026-01-01T00:00:00Z",
      pause_review_after: "2026-06-01T00:00:00Z",
    })
    .select("id")
    .single();
  expect(error).toBeNull();
  return data!.id as string;
}

async function insertEvent(
  user: TestUser,
  googleEventId: string,
  startAt: string,
  source = "app",
) {
  const { error } = await admin.from("synced_events").insert({
    user_id: user.id,
    source,
    google_event_id: googleEventId,
    title: "予定",
    start_at: startAt,
    end_at: new Date(new Date(startAt).getTime() + 30 * 60_000).toISOString(),
  });
  expect(error).toBeNull();
}

async function insertException(user: TestUser, ruleId: string, date: string) {
  const { error } = await admin
    .from("recurring_exceptions")
    .insert({ rule_id: ruleId, user_id: user.id, occurrence_date: date });
  expect(error).toBeNull();
}

async function eventIds(user: TestUser): Promise<string[]> {
  const { data } = await admin
    .from("synced_events")
    .select("google_event_id")
    .eq("user_id", user.id);
  return (data ?? []).map((r) => r.google_event_id as string).sort();
}

async function exceptionDates(ruleId: string): Promise<string[]> {
  const { data } = await admin
    .from("recurring_exceptions")
    .select("occurrence_date")
    .eq("rule_id", ruleId);
  return (data ?? []).map((r) => r.occurrence_date as string).sort();
}

const today = dateOnly(0);
const yesterday = dateOnly(-1);
const tomorrow = dateOnly(1);
const todayStart = `${today}T00:00:00.000Z`;

beforeAll(async () => {
  userA = await createTestUser(admin, "定期更新A");
  userB = await createTestUser(admin, "定期更新B");
});

afterAll(async () => {
  await deleteTestUser(admin, userA.id);
  await deleteTestUser(admin, userB.id);
  await sql.end();
});

describe("定期予定の更新を1トランザクションで確定する(G-108)", () => {
  it("T1/T8: ルールが更新され、今日以降の予定と例外が消え、休止の起点が更新される", async () => {
    const ruleId = await insertRule(userA);
    const prefix = `${RECURRING_ID_PREFIX}${ruleId}:`;
    await insertEvent(userA, `${prefix}${tomorrow}`, `${tomorrow}T09:00:00Z`);
    await insertException(userA, ruleId, tomorrow);

    const result = await updateRecurringRule(userA.client, ruleId, {
      ...INPUT,
      title: "朝会(改)",
      startTime: "10:00",
      endTime: "10:30",
    });

    expect(result.ok).toBe(true);
    const { data: rule } = await admin
      .from("recurring_rules")
      .select("title, start_time, inactivity_since, pause_review_after")
      .eq("id", ruleId)
      .single();
    expect(rule!.title).toBe("朝会(改)");
    expect(rule!.start_time).toBe("10:00:00");
    expect(rule!.pause_review_after).toBeNull();
    expect(
      new Date(rule!.inactivity_since as string).getTime(),
    ).toBeGreaterThan(Date.now() - 60_000);
    expect(await eventIds(userA)).not.toContain(`${prefix}${tomorrow}`);
    expect(await exceptionDates(ruleId)).toEqual([]);
  });

  it("T2/T3: 閾値ちょうどの予定・今日の例外は消え、1ミリ秒前の予定・昨日の例外は残る", async () => {
    const ruleId = await insertRule(userA);
    const prefix = `${RECURRING_ID_PREFIX}${ruleId}:`;
    await insertEvent(userA, `${prefix}at-threshold`, todayStart);
    await insertEvent(
      userA,
      `${prefix}just-before`,
      new Date(new Date(todayStart).getTime() - 1).toISOString(),
    );
    await insertException(userA, ruleId, today);
    await insertException(userA, ruleId, yesterday);

    const result = await updateRecurringRule(userA.client, ruleId, INPUT);

    expect(result.ok).toBe(true);
    const ids = await eventIds(userA);
    expect(ids).not.toContain(`${prefix}at-threshold`);
    expect(ids).toContain(`${prefix}just-before`);
    expect(await exceptionDates(ruleId)).toEqual([yesterday]);
  });

  it("T6: 別ルールの予定と、rec:で始まらない手動の予定は削除されない", async () => {
    const ruleId = await insertRule(userA);
    const otherRuleId = await insertRule(userA);
    const otherId = `${RECURRING_ID_PREFIX}${otherRuleId}:${tomorrow}`;
    await insertEvent(userA, otherId, `${tomorrow}T09:00:00Z`);
    await insertEvent(userA, `app:manual-${ruleId}`, `${tomorrow}T09:00:00Z`);
    await insertEvent(
      userA,
      `${RECURRING_ID_PREFIX}${ruleId}:g`,
      `${tomorrow}T09:00:00Z`,
      "google",
    );

    const result = await updateRecurringRule(userA.client, ruleId, INPUT);

    expect(result.ok).toBe(true);
    const ids = await eventIds(userA);
    expect(ids).toContain(otherId);
    expect(ids).toContain(`app:manual-${ruleId}`);
    // source が app 以外の行は、同じ接頭辞でも対象外
    expect(ids).toContain(`${RECURRING_ID_PREFIX}${ruleId}:g`);
  });

  it("T4: 例外の削除が失敗したら、ルールの更新も予定の削除も取り消される", async () => {
    const ruleId = await insertRule(userA);
    const prefix = `${RECURRING_ID_PREFIX}${ruleId}:`;
    await insertEvent(userA, `${prefix}${tomorrow}`, `${tomorrow}T09:00:00Z`);
    await insertException(userA, ruleId, tomorrow);
    const suffix = ruleId.replaceAll("-", "");
    // 他のテストファイルに影響しないよう、このルールの例外だけを拒否する
    await sql.unsafe(`
      create function public.g108_reject_delete_${suffix}() returns trigger
      language plpgsql as $$
      begin
        if old.rule_id = '${ruleId}' then
          raise exception 'g108 injected failure';
        end if;
        return old;
      end $$;
      create trigger g108_reject_${suffix} before delete on public.recurring_exceptions
        for each row execute function public.g108_reject_delete_${suffix}();
    `);
    try {
      const result = await updateRecurringRule(userA.client, ruleId, {
        ...INPUT,
        title: "取り消されるはず",
      });

      expect(result.ok).toBe(false);
      const { data: rule } = await admin
        .from("recurring_rules")
        .select("title")
        .eq("id", ruleId)
        .single();
      expect(rule!.title).toBe("朝会");
      expect(await eventIds(userA)).toContain(`${prefix}${tomorrow}`);
      expect(await exceptionDates(ruleId)).toEqual([tomorrow]);
    } finally {
      await sql.unsafe(`
        drop trigger g108_reject_${suffix} on public.recurring_exceptions;
        drop function public.g108_reject_delete_${suffix}();
      `);
    }
  });

  it("T5: 他ユーザーのルールは更新も削除もされない", async () => {
    const ruleId = await insertRule(userA);
    const prefix = `${RECURRING_ID_PREFIX}${ruleId}:`;
    await insertEvent(userA, `${prefix}${tomorrow}`, `${tomorrow}T09:00:00Z`);
    await insertException(userA, ruleId, tomorrow);

    const result = await updateRecurringRule(userB.client, ruleId, {
      ...INPUT,
      title: "乗っ取り",
    });

    expect(result.ok).toBe(false);
    const { data: rule } = await admin
      .from("recurring_rules")
      .select("title")
      .eq("id", ruleId)
      .single();
    expect(rule!.title).toBe("朝会");
    expect(await eventIds(userA)).toContain(`${prefix}${tomorrow}`);
    expect(await exceptionDates(ruleId)).toEqual([tomorrow]);
  });

  it("T7: 未ログイン(anon)はRPCを実行できない", async () => {
    const ruleId = await insertRule(userA);
    const anon = createAnonClient();

    const { error } = await anon.rpc("update_recurring_rule", {
      p_rule_id: ruleId,
      p_title: "未認証",
      p_pattern: "daily",
      p_weekdays: null,
      p_start_time: "09:00",
      p_end_time: "09:30",
      p_timezone: "UTC",
      p_starts_on: "2026-01-01",
      p_ends_on: null,
      p_threshold: todayStart,
      p_today: today,
    });

    expect(error).not.toBeNull();
    const { data: rule } = await admin
      .from("recurring_rules")
      .select("title")
      .eq("id", ruleId)
      .single();
    expect(rule!.title).toBe("朝会");
  });
});
