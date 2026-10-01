import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  deleteTimeEntry,
  startTimer,
  stopTimer,
  updateTimeEntry,
} from "@/lib/timer/service";
import { fetchRunningEntry, fetchTimeEntries } from "@/lib/timer/entries";
import {
  createAdminClient,
  createAnonClient,
  createDbSql,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "./helpers";

// 仕様書: docs/specs/P2-2_予定連動タイマー.md S9〜S14
// ローカルSupabase(npx supabase start)前提。RLS認証済みクライアントで実行する。

const admin = createAdminClient();
const sql = createDbSql();
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
  await sql.end();
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

// 仕様書: docs/specs/P5-4_実績からの再計測.md S8
describe("実績からの再計測(P5-4 S8)", () => {
  it("S8: 実行中ありで再計測すると自動停止のうえ、元実績のgoogleEventId・titleを引き継いだ実行中が1本だけになる", async () => {
    await clearEntries(userA.client);

    // 元実績(完了済み・予定紐づき)を作る
    await startTimer(userA.client, {
      googleEventId: "g-orig",
      title: "元の作業",
    });
    await stopTimer(userA.client);
    // 別の実行中タイマーがある状態にする
    await startTimer(userA.client, { googleEventId: null, title: "割り込み" });

    // 再計測 = 元実績のスナップショットで開始
    const result = await startTimer(userA.client, {
      googleEventId: "g-orig",
      title: "元の作業",
    });
    expect(result.ok).toBe(true);

    const rows = await fetchAllEntries(userA.id);
    expect(rows).toHaveLength(3);

    // 実行中(end_at IS NULL)は常に1本で、引き継いだ値を持つ
    const runningRows = rows.filter((row) => row.end_at === null);
    expect(runningRows).toHaveLength(1);
    expect(runningRows[0]!.google_event_id).toBe("g-orig");
    expect(runningRows[0]!.title).toBe("元の作業");

    // 実行中だった割り込みは自動停止されている
    const interrupted = rows.find((row) => row.title === "割り込み")!;
    expect(interrupted.end_at).not.toBeNull();
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

  // 仕様書: docs/specs/P3-1_オーバーレイ表示.md S13
  it("S13: 確定済み実績にgoogle_event_idが設定されている場合、googleEventIdとして返る", async () => {
    await clearEntries(userA.client);
    await startTimer(userA.client, {
      googleEventId: "g-1",
      title: "設計レビュー",
    });
    await stopTimer(userA.client);

    const entries = await fetchTimeEntries(userA.client, new Date());
    expect(entries).toHaveLength(1);
    expect(entries[0]!.googleEventId).toBe("g-1");
  });
});

// 仕様書: docs/specs/P2-4_実績の手動編集.md S16〜S21
describe("実績の手動編集(S16〜S21)", () => {
  async function insertConfirmedEntry(
    client: SupabaseClient,
    userId: string,
    title = "設計レビュー",
  ) {
    const startAt = new Date();
    const endAt = new Date(startAt.getTime() + 30 * 60 * 1000);
    const { data, error } = await client
      .from("time_entries")
      .insert({
        user_id: userId,
        title,
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
      })
      .select("id")
      .single();
    if (error) {
      throw new Error(error.message);
    }
    return { id: data!.id as string, startAt, endAt };
  }

  it("S16: 確定済み実績のタイトル・開始/終了を更新できる", async () => {
    await clearEntries(userA.client);
    const entry = await insertConfirmedEntry(userA.client, userA.id);

    const newStart = new Date(entry.startAt.getTime() + 60 * 1000);
    const newEnd = new Date(entry.endAt.getTime() + 60 * 1000);
    const result = await updateTimeEntry(userA.client, entry.id, {
      title: "修正後タイトル",
      startAt: newStart.toISOString(),
      endAt: newEnd.toISOString(),
    });
    expect(result.ok).toBe(true);

    const rows = await fetchAllEntries(userA.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe("修正後タイトル");
    expect(new Date(rows[0]!.start_at as string).getTime()).toBe(
      newStart.getTime(),
    );
    expect(new Date(rows[0]!.end_at as string).getTime()).toBe(
      newEnd.getTime(),
    );
  });

  it("S17: 終了時刻が開始時刻より前だと更新は失敗し、行は変更されない", async () => {
    await clearEntries(userA.client);
    const entry = await insertConfirmedEntry(
      userA.client,
      userA.id,
      "元タイトル",
    );

    const result = await updateTimeEntry(userA.client, entry.id, {
      title: "変更後",
      startAt: entry.startAt.toISOString(),
      endAt: new Date(entry.startAt.getTime() - 60 * 1000).toISOString(),
    });
    expect(result.ok).toBe(false);

    const rows = await fetchAllEntries(userA.id);
    expect(rows[0]!.title).toBe("元タイトル");
  });

  it("S18: 実行中エントリ(end_at IS NULL)は更新できない", async () => {
    await clearEntries(userA.client);
    await startTimer(userA.client, { googleEventId: "g-1", title: "作業中" });
    const rowsBefore = await fetchAllEntries(userA.id);
    const runningId = rowsBefore[0]!.id as string;

    const result = await updateTimeEntry(userA.client, runningId, {
      title: "書き換え試行",
      startAt: new Date().toISOString(),
      endAt: new Date().toISOString(),
    });
    expect(result.ok).toBe(false);

    const rows = await fetchAllEntries(userA.id);
    expect(rows[0]!.title).toBe("作業中");
    expect(rows[0]!.end_at).toBeNull();

    await stopTimer(userA.client);
  });

  it("S19: 確定済み実績を削除できる", async () => {
    await clearEntries(userA.client);
    const entry = await insertConfirmedEntry(userA.client, userA.id);

    const result = await deleteTimeEntry(userA.client, entry.id);
    expect(result.ok).toBe(true);
    expect(await fetchAllEntries(userA.id)).toHaveLength(0);
  });

  it("S20: 実行中エントリは削除できない", async () => {
    await clearEntries(userA.client);
    await startTimer(userA.client, { googleEventId: "g-1", title: "作業中" });
    const rowsBefore = await fetchAllEntries(userA.id);
    const runningId = rowsBefore[0]!.id as string;

    const result = await deleteTimeEntry(userA.client, runningId);
    expect(result.ok).toBe(false);
    expect(await fetchAllEntries(userA.id)).toHaveLength(1);

    await stopTimer(userA.client);
  });

  it("S21: 他ユーザーの確定済み実績は更新も削除もできない", async () => {
    await clearEntries(userA.client);
    await clearEntries(userB.client);
    const entryB = await insertConfirmedEntry(
      userB.client,
      userB.id,
      "Bの実績",
    );

    const updateResult = await updateTimeEntry(userA.client, entryB.id, {
      title: "Aによる書き換え",
      startAt: entryB.startAt.toISOString(),
      endAt: entryB.endAt.toISOString(),
    });
    expect(updateResult.ok).toBe(false);

    const deleteResult = await deleteTimeEntry(userA.client, entryB.id);
    expect(deleteResult.ok).toBe(false);

    const rowsB = await fetchAllEntries(userB.id);
    expect(rowsB).toHaveLength(1);
    expect(rowsB[0]!.title).toBe("Bの実績");
  });
});

describe("P16-data タイマー切替の原子性と権限", () => {
  it("D9: 新規INSERT失敗時に旧タイマーの停止をロールバックする", async () => {
    await clearEntries(userA.client);
    expect(
      await startTimer(userA.client, { title: "継続中", googleEventId: null }),
    ).toEqual({ ok: true });
    const before = await fetchAllEntries(userA.id);
    // NOT NULL違反をINSERT段階で発生させ、停止が先行確定しないことを確認する。
    const { error } = await userA.client.rpc("start_timer", {
      p_title: null,
      p_google_event_id: null,
    });
    expect(error?.code).toBe("23502");
    expect(await fetchAllEntries(userA.id)).toEqual(before);
    expect((await fetchRunningEntry(userA.client))?.id).toBe(before[0]!.id);
  });

  it("D10: 同一利用者の8件同時開始は全件成功し実行中は1本だけ", async () => {
    await clearEntries(userA.client);
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        startTimer(userA.client, {
          title: `並行作業${index}`,
          googleEventId: null,
        }),
      ),
    );
    expect(results.every((result) => result.ok)).toBe(true);
    const rows = (await fetchAllEntries(userA.id)).sort(
      (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
    );
    expect(rows).toHaveLength(8);
    expect(rows.filter((row) => row.end_at === null)).toHaveLength(1);
    expect(rows.at(-1)!.end_at).toBeNull();
    for (let index = 0; index < rows.length - 1; index += 1) {
      expect(new Date(rows[index]!.end_at).getTime()).toBeGreaterThanOrEqual(
        new Date(rows[index]!.start_at).getTime(),
      );
      expect(rows[index]!.end_at).toBe(rows[index + 1]!.start_at);
    }
  });

  it("D11: 同一利用者の開始と停止が競合しても両方成功し区間は非負", async () => {
    await clearEntries(userA.client);
    await startTimer(userA.client, { title: "元の計測", googleEventId: null });
    const results = await Promise.all([
      startTimer(userA.client, { title: "新しい計測", googleEventId: null }),
      stopTimer(userA.client),
    ]);
    expect(results).toEqual([{ ok: true }, { ok: true }]);
    const rows = await fetchAllEntries(userA.id);
    expect(rows).toHaveLength(2);
    expect(
      rows.filter((row) => row.end_at === null).length,
    ).toBeLessThanOrEqual(1);
    for (const row of rows) {
      if (row.end_at !== null) {
        expect(new Date(row.end_at).getTime()).toBeGreaterThanOrEqual(
          new Date(row.start_at).getTime(),
        );
      }
    }
  });

  it("D12: 本人のみを変更し匿名・auth.uidなしの呼び出しは拒否する", async () => {
    await clearEntries(userA.client);
    await clearEntries(userB.client);
    await startTimer(userB.client, {
      title: "他人の計測",
      googleEventId: null,
    });
    const beforeB = await fetchAllEntries(userB.id);
    expect(
      (
        await userA.client.rpc("start_timer", {
          p_title: "本人の計測",
          p_google_event_id: null,
        })
      ).error,
    ).toBeNull();
    expect((await userA.client.rpc("stop_timer")).error).toBeNull();
    expect(await fetchAllEntries(userB.id)).toEqual(beforeB);
    const anon = createAnonClient();
    expect(
      (
        await anon.rpc("start_timer", {
          p_title: "匿名",
          p_google_event_id: null,
        })
      ).error?.code,
    ).toBe("42501");
    expect((await anon.rpc("stop_timer")).error?.code).toBe("42501");
    for (const operation of ["start", "stop"]) {
      await expect(
        sql.begin(async (transaction) => {
          await transaction`set local role authenticated`;
          if (operation === "start") {
            await transaction`select public.start_timer('未認証', null)`;
          } else {
            await transaction`select public.stop_timer()`;
          }
        }),
      ).rejects.toMatchObject({ code: "28000" });
    }
  });

  it("D13: RPCはSECURITY INVOKER・search_path固定・authenticated限定", async () => {
    const rows = await sql`
      select p.proname, p.prosecdef, p.proconfig,
        has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute,
        has_function_privilege('anon', p.oid, 'execute') as anon_execute,
        has_function_privilege('service_role', p.oid, 'execute') as service_execute
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('start_timer', 'stop_timer')
      order by p.proname
    `;
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.prosecdef).toBe(false);
      expect(row.proconfig).toContain('search_path=""');
      expect(row.authenticated_execute).toBe(true);
      expect(row.anon_execute).toBe(false);
      expect(row.service_execute).toBe(false);
    }
  });
});
