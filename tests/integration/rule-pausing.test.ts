import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  fetchRecurringRules,
  materializeRecurringInstances,
  updateRecurringRule,
} from "@/lib/calendar/recurring";
import { setRulePause } from "@/lib/calendar/rule-pausing";
import {
  createAdminClient,
  createAnonClient,
  createDbSql,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "./helpers";

const admin = createAdminClient();
const sql = createDbSql();
let a: TestUser;
let b: TestUser;
const now = new Date();
const isoDay = (offset: number) =>
  new Date(now.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
const at = (offset: number, time = "09:00") => `${isoDay(offset)}T${time}:00Z`;
const tomorrow = isoDay(1);

async function rule(overrides: Record<string, unknown> = {}) {
  const { data, error } = await admin
    .from("recurring_rules")
    .insert({
      user_id: a.id,
      title: "読書",
      pattern: "daily",
      weekdays: null,
      start_time: "09:00",
      end_time: "09:30",
      timezone: "UTC",
      starts_on: isoDay(-60),
      ends_on: null,
      origin: "suggestion",
      inactivity_since: at(-60, "00:00"),
      ...overrides,
    })
    .select("id")
    .single();
  expect(error).toBeNull();
  return data!.id as string;
}
async function entry(ruleId: string, offset: number, running = false) {
  const { error } = await admin.from("time_entries").insert({
    user_id: a.id,
    title: "読書",
    google_event_id: `rec:${ruleId}:${isoDay(offset)}`,
    start_at: at(offset),
    end_at: running ? null : at(offset, "09:30"),
  });
  expect(error).toBeNull();
}
async function suggestions(pNow = now.toISOString(), client = a.client) {
  const { data, error } = await client.rpc("get_recurring_pause_suggestions", {
    p_now: pNow,
  });
  expect(error).toBeNull();
  return data as {
    rule_id: string;
    missed_count: number;
    last_recorded_at: string | null;
  }[];
}
async function materialize(ruleId: string) {
  await materializeRecurringInstances(a.client, now, {
    timeMin: at(-2, "00:00"),
    timeMax: at(5, "00:00"),
  });
  const { data, error } = await admin
    .from("synced_events")
    .select("google_event_id")
    .eq("user_id", a.id)
    .like("google_event_id", `rec:${ruleId}:%`);
  expect(error).toBeNull();
  return (data ?? []).map((row) => String(row.google_event_id));
}

beforeAll(async () => {
  a = await createTestUser(admin, "休止テストA");
  b = await createTestUser(admin, "休止テストB");
});
beforeEach(async () => {
  await admin.from("synced_events").delete().eq("user_id", a.id);
  await admin.from("time_entries").delete().eq("user_id", a.id);
  await admin.from("recurring_rules").delete().eq("user_id", a.id);
});
afterAll(async () => {
  if (a) await deleteTestUser(admin, a.id);
  if (b) await deleteTestUser(admin, b.id);
  await sql.end();
});

describe("休止提案の条件", () => {
  it.each(["daily", "weekdays", "weekly"])(
    "14日以上かつ3回以上の未記録で提案する: %s",
    async (pattern) => {
      const id = await rule({
        pattern,
        weekdays: pattern === "weekly" ? [now.getUTCDay()] : null,
      });
      await entry(id, -30);
      const result = await suggestions();
      expect(result).toHaveLength(1);
      expect(result[0]?.rule_id).toBe(id);
      expect(new Date(result[0]!.last_recorded_at!).toISOString()).toBe(
        new Date(at(-30)).toISOString(),
      );
      expect(result[0]!.missed_count).toBeGreaterThanOrEqual(3);
    },
  );
  it("未記録3回でも14日未満なら提案しない", async () => {
    const id = await rule();
    await entry(id, -4);
    expect(await suggestions()).toEqual([]);
  });
  it("14日以上でも未記録2回なら提案しない", async () => {
    await rule({
      pattern: "weekly",
      weekdays: [now.getUTCDay()],
      starts_on: isoDay(-14),
      inactivity_since: at(-14, "00:00"),
    });
    expect(await suggestions(at(0, "08:00"))).toEqual([]);
  });
  it("実績がない場合は最初の予定から14日を数える", async () => {
    const id = await rule({
      starts_on: isoDay(-14),
      inactivity_since: at(-30, "00:00"),
    });
    expect(await suggestions(at(0, "08:59"))).toEqual([]);
    expect((await suggestions(at(0, "09:00")))[0]?.rule_id).toBe(id);
  });
  it("記録がある場合は14日の境界から提案する", async () => {
    const id = await rule();
    await entry(id, -14);
    expect(await suggestions(at(0, "08:59"))).toEqual([]);
    expect((await suggestions(at(0, "09:00")))[0]?.rule_id).toBe(id);
  });
  it("個別削除した回を数えない", async () => {
    const id = await rule({
      pattern: "weekly",
      weekdays: [now.getUTCDay()],
      starts_on: isoDay(-21),
    });
    const { error } = await admin.from("recurring_exceptions").insert(
      [-21, -14].map((offset) => ({
        rule_id: id,
        user_id: a.id,
        occurrence_date: isoDay(offset),
      })),
    );
    expect(error).toBeNull();
    expect(await suggestions(at(0, "12:00"))).toEqual([]);
  });
  it("計測中・手動作成・終了済みの予定は提案しない", async () => {
    const id = await rule();
    await entry(id, -1, true);
    await rule({ origin: "manual" });
    await rule({ ends_on: isoDay(-1) });
    expect(await suggestions()).toEqual([]);
  });
  it("14日後に再確認を選ぶと、期限まで再提案しない", async () => {
    const id = await rule();
    expect(await setRulePause(a.client, id, "snooze")).toEqual({ ok: true });
    const { data } = await admin
      .from("recurring_rules")
      .select("pause_review_after")
      .eq("id", id)
      .single();
    const due = new Date(data!.pause_review_after).getTime();
    expect(await suggestions(new Date(due - 1).toISOString())).toEqual([]);
    expect((await suggestions(data!.pause_review_after))[0]?.rule_id).toBe(id);
  });
  it("編集後は未記録の判定を数え直す", async () => {
    const id = await rule();
    expect(await suggestions()).toHaveLength(1);
    expect(
      await updateRecurringRule(a.client, id, {
        title: "読書",
        pattern: "daily",
        weekdays: null,
        startTime: "10:00",
        endTime: "10:30",
        timezone: "UTC",
        startsOn: isoDay(-60),
        endsOn: null,
      }),
    ).toEqual({ ok: true });
    expect(await suggestions()).toEqual([]);
  });
  it("タイムゾーンの現地曜日で判定する", async () => {
    // UTCでは日曜、キリバスでは月曜。
    const id = await rule({
      timezone: "Pacific/Kiritimati",
      pattern: "weekly",
      weekdays: [1],
      starts_on: "2026-09-01",
      inactivity_since: "2026-09-01T00:00:00Z",
    });
    const result = await suggestions("2026-10-18T22:00:00Z");
    expect(result[0]?.rule_id).toBe(id);
    expect(Number(result[0]?.missed_count)).toBe(7);
  });
});

describe("休止・再開と予定の保持", () => {
  it("翌日から休止し、過去・当日・実績を維持する。再開しても休止期間を復活させない", async () => {
    const id = await rule();
    await entry(id, -1);
    const before = await materialize(id);
    expect(before).toContain(`rec:${id}:${tomorrow}`);
    expect(await setRulePause(a.client, id, "pause")).toEqual({ ok: true });
    const during = await materialize(id);
    expect(during).toContain(`rec:${id}:${isoDay(-1)}`);
    expect(during).toContain(`rec:${id}:${isoDay(0)}`);
    expect(during).not.toContain(`rec:${id}:${tomorrow}`);
    expect(await suggestions()).toEqual([]);
    const { count } = await admin
      .from("time_entries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", a.id);
    expect(count).toBe(1);
    // 以前から休止していた期間を再現する。再開してもこの過去の休止期間は残る。
    await admin
      .from("recurring_rule_pauses")
      .update({ starts_on: isoDay(-1) })
      .eq("rule_id", id);
    await admin
      .from("synced_events")
      .delete()
      .eq("user_id", a.id)
      .like("google_event_id", `rec:${id}:%`);
    expect(await setRulePause(a.client, id, "resume")).toEqual({ ok: true });
    const resumed = await materialize(id);
    expect(resumed).not.toContain(`rec:${id}:${isoDay(-1)}`);
    expect(resumed).not.toContain(`rec:${id}:${isoDay(0)}`);
    expect(resumed).toContain(`rec:${id}:${tomorrow}`);
    expect(await suggestions()).toEqual([]);
  });
  it("同時の休止要求は1つの休止期間だけを保存する", async () => {
    const id = await rule();
    const results = await Promise.all([
      setRulePause(a.client, id, "pause"),
      setRulePause(a.client, id, "pause"),
    ]);
    expect(results).toEqual([{ ok: true }, { ok: true }]);
    const { data } = await admin
      .from("recurring_rule_pauses")
      .select("id")
      .eq("rule_id", id);
    expect(data).toHaveLength(1);
  });
  it("古い画面からの直接生成も休止期間には保存されない", async () => {
    const id = await rule();
    expect(await setRulePause(a.client, id, "pause")).toEqual({ ok: true });
    const { error } = await a.client.from("synced_events").upsert(
      {
        user_id: a.id,
        source: "app",
        google_event_id: `rec:${id}:${tomorrow}`,
        title: "読書",
        start_at: at(1),
        end_at: at(1, "09:30"),
      },
      { onConflict: "user_id,google_event_id", ignoreDuplicates: true },
    );
    expect(error).toBeNull();
    expect(await materialize(id)).not.toContain(`rec:${id}:${tomorrow}`);
  });
  it("予定の削除が失敗した場合、休止状態の保存も取り消す", async () => {
    const id = await rule();
    await materialize(id);
    await sql.unsafe(`create function private.test_reject_pause_delete() returns trigger language plpgsql as $$ begin
      if old.google_event_id = 'rec:${id}:${tomorrow}' then raise exception 'test deletion failure'; end if;
      return old; end $$;
      create trigger test_reject_pause_delete before delete on public.synced_events for each row execute function private.test_reject_pause_delete();`);
    try {
      expect(await setRulePause(a.client, id, "pause")).toEqual({ ok: false });
      const { data } = await admin
        .from("recurring_rule_pauses")
        .select("id")
        .eq("rule_id", id);
      expect(data).toEqual([]);
      expect(await materialize(id)).toContain(`rec:${id}:${tomorrow}`);
    } finally {
      await sql.unsafe(
        "drop trigger test_reject_pause_delete on public.synced_events; drop function private.test_reject_pause_delete();",
      );
    }
  });
  it("休止期間は共有の予定一覧に含まれる", async () => {
    const id = await rule();
    await setRulePause(a.client, id, "pause");
    const rules = await fetchRecurringRules(a.client);
    expect(rules.find((r) => r.id === id)?.pauses).toEqual([
      { startsOn: tomorrow, endsOn: null },
    ]);
  });
});

describe("同時更新の整合性", () => {
  it("予定生成と休止が重なっても将来の予定を残さない", async () => {
    const id = await rule();
    const results = await Promise.all([
      materialize(id),
      setRulePause(a.client, id, "pause"),
    ]);
    expect(results[1]).toEqual({ ok: true });
    expect(await materialize(id)).not.toContain(`rec:${id}:${tomorrow}`);
  });
  it("休止中のルールに古い学習結果を適用しない", async () => {
    const id = await rule();
    await setRulePause(a.client, id, "pause");
    const { data, error } = await a.client.rpc(
      "apply_recurring_rule_learning",
      {
        p_rule_id: id,
        p_previous_start: "09:00",
        p_previous_end: "09:30",
        p_new_start: "09:05",
        p_new_end: "09:35",
      },
    );
    expect(error).toBeNull();
    expect(data).toBe(false);
    const { data: row } = await admin
      .from("recurring_rules")
      .select("start_time")
      .eq("id", id)
      .single();
    expect(row!.start_time).toBe("09:00:00");
  });
});

describe("本人だけが操作できる", () => {
  it("他ユーザーの取得・休止・再開・延期と、他ユーザーへの休止行作成を拒否する", async () => {
    const id = await rule();
    expect(await suggestions(now.toISOString(), b.client)).toEqual([]);
    for (const action of ["pause", "resume", "snooze"] as const) {
      expect(await setRulePause(b.client, id, action)).toEqual({ ok: false });
    }
    const { error } = await b.client
      .from("recurring_rule_pauses")
      .insert({ rule_id: id, user_id: b.id, starts_on: tomorrow });
    expect(error).not.toBeNull();
    await setRulePause(a.client, id, "pause");
    const { data } = await b.client.from("recurring_rule_pauses").select("id");
    expect(data).toEqual([]);
  });
  it("未認証でのRPC実行を拒否する", async () => {
    const id = await rule();
    const anon = createAnonClient();
    const { error } = await anon.rpc("set_recurring_rule_pause", {
      p_rule_id: id,
      p_action: "pause",
    });
    expect(error).not.toBeNull();
  });
});
