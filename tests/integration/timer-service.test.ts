import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";

import { startTimer, stopTimer } from "@/lib/timer/service";
import { fetchRunningEntry, fetchTimeEntries } from "@/lib/timer/entries";
import {
  createAdminClient,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "./helpers";

// 仕様書: docs/specs/P2-2_予定連動タイマー.md S9〜S14
// ローカルSupabase(npx supabase start)前提。RLS認証済みクライアントで実行する。

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
    .select("id, title, google_event_id, start_at, end_at")
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

describe("startTimer(S9 / S10)", () => {
  it("S9: 実行中なしで開始すると、予定に紐づく実行中エントリが作られる", async () => {
    await clearEntries(userA.client);

    const before = new Date();
    const result = await startTimer(userA.client, {
      googleEventId: "g-1",
      title: "設計レビュー",
    });
    expect(result.ok).toBe(true);

    const rows = await fetchAllEntries(userA.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.google_event_id).toBe("g-1");
    expect(rows[0]!.title).toBe("設計レビュー");
    expect(rows[0]!.end_at).toBeNull();
    // start_at はサーバー側で決定した現在時刻
    const startAt = new Date(rows[0]!.start_at as string);
    expect(startAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    expect(startAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it("S10: 実行中ありで別の予定を開始すると、既存が自動停止され実行中は常に1本", async () => {
    await clearEntries(userA.client);
    await startTimer(userA.client, { googleEventId: "g-1", title: "作業1" });

    const result = await startTimer(userA.client, {
      googleEventId: "g-2",
      title: "作業2",
    });
    expect(result.ok).toBe(true);

    const rows = await fetchAllEntries(userA.id);
    expect(rows).toHaveLength(2);

    const stopped = rows.find((row) => row.google_event_id === "g-1")!;
    const running = rows.find((row) => row.google_event_id === "g-2")!;
    expect(stopped.end_at).not.toBeNull();
    expect(running.end_at).toBeNull();

    const runningRows = rows.filter((row) => row.end_at === null);
    expect(runningRows).toHaveLength(1);
  });
});

describe("stopTimer(S11 / S12)", () => {
  it("S11: 停止すると end_at が設定され実績として確定する", async () => {
    await clearEntries(userA.client);
    await startTimer(userA.client, { googleEventId: "g-1", title: "作業" });

    const result = await stopTimer(userA.client);
    expect(result.ok).toBe(true);

    const rows = await fetchAllEntries(userA.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.end_at).not.toBeNull();
    expect(
      new Date(rows[0]!.end_at as string).getTime(),
    ).toBeGreaterThanOrEqual(new Date(rows[0]!.start_at as string).getTime());
  });

  it("S12: 実行中なしで停止してもエラーにならない(冪等)", async () => {
    await clearEntries(userA.client);

    const result = await stopTimer(userA.client);
    expect(result.ok).toBe(true);
    expect(await fetchAllEntries(userA.id)).toHaveLength(0);
  });
});

describe("ユーザー分離(S13)", () => {
  it("S13: 他ユーザーの実行中タイマーには影響せず、見えもしない", async () => {
    await clearEntries(userA.client);
    await clearEntries(userB.client);

    await startTimer(userB.client, { googleEventId: "g-b", title: "Bの作業" });
    await startTimer(userA.client, { googleEventId: "g-a", title: "Aの作業" });

    // Bの実行中はAの開始で停止されていない
    const rowsB = await fetchAllEntries(userB.id);
    expect(rowsB).toHaveLength(1);
    expect(rowsB[0]!.end_at).toBeNull();

    // Aから見える実行中エントリは自分のものだけ
    const runningA = await fetchRunningEntry(userA.client);
    expect(runningA?.googleEventId).toBe("g-a");

    await stopTimer(userB.client);
  });
});

// 仕様書: docs/specs/P2-3_フリータイマー.md S9〜S11
describe("フリータイマー(S9〜S11)", () => {
  it("S9: 実行中なしでフリータイマーを開始すると、google_event_idがNULLの実行中エントリが作られる", async () => {
    await clearEntries(userA.client);

    const result = await startTimer(userA.client, {
      googleEventId: null,
      title: "読書",
    });
    expect(result.ok).toBe(true);

    const rows = await fetchAllEntries(userA.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.google_event_id).toBeNull();
    expect(rows[0]!.title).toBe("読書");
    expect(rows[0]!.end_at).toBeNull();
  });

  it("S10: 予定連動タイマーが実行中のときにフリータイマーを開始すると、既存が自動停止されフリータイマーが実行中になる", async () => {
    await clearEntries(userA.client);
    await startTimer(userA.client, { googleEventId: "g-1", title: "作業1" });

    const result = await startTimer(userA.client, {
      googleEventId: null,
      title: "読書",
    });
    expect(result.ok).toBe(true);

    const rows = await fetchAllEntries(userA.id);
    expect(rows).toHaveLength(2);

    const stopped = rows.find((row) => row.google_event_id === "g-1")!;
    const running = rows.find((row) => row.google_event_id === null)!;
    expect(stopped.end_at).not.toBeNull();
    expect(running.end_at).toBeNull();
    expect(running.title).toBe("読書");

    const runningRows = rows.filter((row) => row.end_at === null);
    expect(runningRows).toHaveLength(1);
  });

  it("S11: フリータイマーが実行中のときに別の予定を開始すると、フリータイマーが自動停止され実績として確定する", async () => {
    await clearEntries(userA.client);
    await startTimer(userA.client, { googleEventId: null, title: "読書" });

    const result = await startTimer(userA.client, {
      googleEventId: "g-2",
      title: "作業2",
    });
    expect(result.ok).toBe(true);

    const rows = await fetchAllEntries(userA.id);
    expect(rows).toHaveLength(2);

    const stoppedFree = rows.find((row) => row.google_event_id === null)!;
    const runningEvent = rows.find((row) => row.google_event_id === "g-2")!;
    expect(stoppedFree.end_at).not.toBeNull();
    expect(stoppedFree.title).toBe("読書");
    expect(runningEvent.end_at).toBeNull();
  });
});

describe("実績の読み取り(S14)", () => {
  it("S14: 確定済み実績は表示週±1週間のみ返り、実行中は期間外でも返る", async () => {
    await clearEntries(userA.client);
    const baseDate = new Date();

    // 期間内(今日)・期間外(3週間前)の確定済み実績
    const inRangeStart = new Date();
    const { error: inRangeError } = await userA.client
      .from("time_entries")
      .insert({
        user_id: userA.id,
        title: "期間内の実績",
        start_at: inRangeStart.toISOString(),
        end_at: new Date(inRangeStart.getTime() + 30 * 60 * 1000).toISOString(),
      });
    expect(inRangeError).toBeNull();

    const outStart = addDays(baseDate, -21);
    const { error: outError } = await userA.client.from("time_entries").insert({
      user_id: userA.id,
      title: "期間外の実績",
      start_at: outStart.toISOString(),
      end_at: new Date(outStart.getTime() + 30 * 60 * 1000).toISOString(),
    });
    expect(outError).toBeNull();

    // 期間外の開始時刻を持つ実行中エントリ(直接insert)
    const { error: runError } = await userA.client.from("time_entries").insert({
      user_id: userA.id,
      title: "実行中の作業",
      start_at: addDays(baseDate, -21).toISOString(),
      end_at: null,
    });
    expect(runError).toBeNull();

    const entries = await fetchTimeEntries(userA.client, baseDate);
    expect(entries.map((entry) => entry.title)).toEqual(["期間内の実績"]);
    // UTCのISO文字列(Z表記)へ正規化されている
    expect(entries[0]!.startAt.endsWith("Z")).toBe(true);

    const running = await fetchRunningEntry(userA.client);
    expect(running?.title).toBe("実行中の作業");

    await stopTimer(userA.client);
  });
});
