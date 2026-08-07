import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addDays, startOfDay } from "date-fns";
import { materializeRecurringInstances } from "@/lib/calendar/recurring";
import { getSessionUser } from "@/lib/supabase/session-user";
import {
  createAdminClient,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "./helpers";

// 仕様書: docs/specs/P6-1_サーバー往復の集約.md S16〜S18

const admin = createAdminClient();
let userA: TestUser;
let userB: TestUser;

const NOW = new Date();

/** "yyyy-MM-dd"(ローカル日付) */
function formatDay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

beforeAll(async () => {
  userA = await createTestUser(admin, "セッションA");
  userB = await createTestUser(admin, "セッションB");
});

afterAll(async () => {
  await deleteTestUser(admin, userA.id);
  await deleteTestUser(admin, userB.id);
});

beforeEach(async () => {
  for (const user of [userA, userB]) {
    await admin.from("synced_events").delete().eq("user_id", user.id);
    await admin.from("recurring_exceptions").delete().eq("user_id", user.id);
    await admin.from("recurring_rules").delete().eq("user_id", user.id);
  }
});

describe("getSessionUser の実クライアントでの挙動(S16・S17)", () => {
  it("S16: 同一クライアントで3回呼んでも同じユーザーが返る", async () => {
    const first = await getSessionUser(userA.client);
    const second = await getSessionUser(userA.client);
    const third = await getSessionUser(userA.client);

    expect(first?.id).toBe(userA.id);
    expect(second?.id).toBe(userA.id);
    expect(third?.id).toBe(userA.id);
  });

  it("S16: /calendar 相当の3箇所から呼んでも往復は1回に集約される", async () => {
    // layout / page / materializeRecurringInstances の3箇所を再現する。
    // WeakMap はクライアント単位なので、未使用のクライアントを新しく作って数える
    const fresh = await createTestUser(admin, "往復計測");
    let calls = 0;
    const original = fresh.client.auth.getUser.bind(fresh.client.auth);
    fresh.client.auth.getUser = (async () => {
      calls += 1;
      return original();
    }) as typeof fresh.client.auth.getUser;

    try {
      const results = await Promise.all([
        getSessionUser(fresh.client),
        getSessionUser(fresh.client),
        getSessionUser(fresh.client),
      ]);

      expect(calls).toBe(1);
      for (const result of results) {
        expect(result?.id).toBe(fresh.id);
      }
    } finally {
      await deleteTestUser(admin, fresh.id);
    }
  });

  it("S17: 別ユーザーのクライアント同士で結果が混ざらない", async () => {
    const resultA = await getSessionUser(userA.client);
    const resultB = await getSessionUser(userB.client);

    expect(resultA?.id).toBe(userA.id);
    expect(resultB?.id).toBe(userB.id);
    expect(resultA?.id).not.toBe(resultB?.id);
  });
});

describe("実体化の例外期間フィルタ(S18)", () => {
  it("S18: 範囲外の例外を取得しても実体化結果は変わらない", async () => {
    const targetDay = startOfDay(addDays(NOW, 2));

    const { data: rule, error: ruleError } = await admin
      .from("recurring_rules")
      .insert({
        user_id: userA.id,
        title: "朝会",
        pattern: "daily",
        weekdays: null,
        start_time: "09:00",
        end_time: "09:30",
        timezone: "Asia/Tokyo",
        starts_on: formatDay(addDays(NOW, -400)),
        ends_on: null,
      })
      .select("id")
      .single();
    expect(ruleError).toBeNull();
    const ruleId = rule!.id as string;

    // 実体化範囲(今週±1週間)から大きく外れた例外。フィルタで取得されないはず
    const { error: farError } = await admin
      .from("recurring_exceptions")
      .insert({
        rule_id: ruleId,
        user_id: userA.id,
        occurrence_date: formatDay(addDays(NOW, -365)),
      });
    expect(farError).toBeNull();

    // 範囲内の例外。こちらは除外として効くはず
    const { error: nearError } = await admin
      .from("recurring_exceptions")
      .insert({
        rule_id: ruleId,
        user_id: userA.id,
        occurrence_date: formatDay(targetDay),
      });
    expect(nearError).toBeNull();

    const rules = await materializeRecurringInstances(userA.client, NOW);

    // 戻り値が fetchRecurringRules と同じ形であること(S7の実DB版)
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({
      id: ruleId,
      title: "朝会",
      startTime: "09:00",
      endTime: "09:30",
    });

    const { data: materialized } = await userA.client
      .from("synced_events")
      .select("google_event_id")
      .like("google_event_id", `rec:${ruleId}:%`);
    const ids = (materialized ?? []).map((row) => row.google_event_id);

    // 範囲内の例外日は実体化されない
    expect(ids).not.toContain(`rec:${ruleId}:${formatDay(targetDay)}`);
    // 例外にしていない日は実体化される
    expect(ids.length).toBeGreaterThan(0);
  });
});
