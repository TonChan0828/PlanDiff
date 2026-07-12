import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { startTimer, stopTimer, updateRunningStart } from "@/lib/timer/service";
import {
  createAdminClient,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "./helpers";

// 仕様書: docs/specs/D-4_計測ヒーローと開始時刻変更.md S7〜S10
// ローカルSupabase前提。実行中エントリ(end_at IS NULL)のstart_at更新をRLS込みで検証する

const admin = createAdminClient();
let userA: TestUser;
let userB: TestUser;

async function clearEntries(client: SupabaseClient): Promise<void> {
  await client
    .from("time_entries")
    .delete()
    .gte("created_at", "1970-01-01T00:00:00Z");
}

async function fetchAllEntries(userId: string) {
  const { data, error } = await admin
    .from("time_entries")
    .select("id, start_at, end_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(error.message);
  }
  return data ?? [];
}

beforeAll(async () => {
  userA = await createTestUser(admin, "ユーザーA");
  userB = await createTestUser(admin, "ユーザーB");
});

afterAll(async () => {
  await deleteTestUser(admin, userA.id);
  await deleteTestUser(admin, userB.id);
});

beforeEach(async () => {
  await clearEntries(userA.client);
  await clearEntries(userB.client);
});

describe("updateRunningStart(S7〜S10)", () => {
  it("S7: 実行中エントリのstart_atが更新される", async () => {
    await startTimer(userA.client, { googleEventId: null, title: "作業" });
    const earlier = new Date(Date.now() - 45 * 60 * 1000).toISOString();

    const result = await updateRunningStart(userA.client, earlier);
    expect(result.ok).toBe(true);

    const rows = await fetchAllEntries(userA.id);
    expect(rows).toHaveLength(1);
    expect(new Date(rows[0]!.start_at as string).toISOString()).toBe(earlier);
    expect(rows[0]!.end_at).toBeNull();
  });

  it("S8: 実行中がない場合はok:falseで、確定済み実績は変更されない", async () => {
    await startTimer(userA.client, { googleEventId: null, title: "作業" });
    await stopTimer(userA.client);
    const before = await fetchAllEntries(userA.id);

    const result = await updateRunningStart(
      userA.client,
      new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    );
    expect(result.ok).toBe(false);

    const after = await fetchAllEntries(userA.id);
    expect(after[0]!.start_at).toBe(before[0]!.start_at);
  });

  it("S9: 未来(+60秒超)は拒否され、現在時刻ちょうどは許容される(境界値)", async () => {
    await startTimer(userA.client, { googleEventId: null, title: "作業" });

    const future = new Date(Date.now() + 120 * 1000).toISOString();
    expect((await updateRunningStart(userA.client, future)).ok).toBe(false);

    const nowIso = new Date().toISOString();
    expect((await updateRunningStart(userA.client, nowIso)).ok).toBe(true);

    // 不正なISOも拒否される
    expect((await updateRunningStart(userA.client, "not-a-date")).ok).toBe(
      false,
    );
  });

  it("S10: 他ユーザーの実行中エントリは更新できない(RLS)", async () => {
    await startTimer(userA.client, { googleEventId: null, title: "作業A" });
    const before = await fetchAllEntries(userA.id);

    const result = await updateRunningStart(
      userB.client,
      new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    );
    // userBに実行中はないためok:false。userAの行は変わらない
    expect(result.ok).toBe(false);
    const after = await fetchAllEntries(userA.id);
    expect(after[0]!.start_at).toBe(before[0]!.start_at);
  });
});
