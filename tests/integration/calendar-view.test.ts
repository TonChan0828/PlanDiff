import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addDays, addHours, parseISO } from "date-fns";
import { fetchSyncedEvents } from "@/lib/calendar/events";
import { computeSyncRange } from "@/lib/google/sync-range";
import {
  createAdminClient,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "./helpers";

// 仕様書: docs/specs/P2-1_カレンダービュー.md S14 / S15
// page(Server Component)が使う読み取りヘルパーを、ローカルSupabase+RLSで検証する

const admin = createAdminClient();
let userA: TestUser;
let userB: TestUser;

// 表示基準日(水曜)。期待値は computeSyncRange から導出し、テスト実行TZに依存させない
const BASE_DATE = new Date(2026, 6, 8);
const range = computeSyncRange(BASE_DATE);
const timeMin = parseISO(range.timeMin);
const timeMax = parseISO(range.timeMax);

async function seedEvent(
  user: TestUser,
  googleEventId: string,
  title: string,
  startAt: Date,
  endAt: Date,
): Promise<void> {
  const { error } = await user.client.from("synced_events").insert({
    user_id: user.id,
    google_event_id: googleEventId,
    title,
    start_at: startAt.toISOString(),
    end_at: endAt.toISOString(),
    synced_at: new Date().toISOString(),
  });
  expect(error).toBeNull();
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
  await admin
    .from("synced_events")
    .delete()
    .gte("synced_at", "1970-01-01T00:00:00Z");
});

describe("fetchSyncedEvents(結合)", () => {
  it("S14: 表示週±1週間の行だけが start_at 昇順で返り、範囲外は含まれない", async () => {
    // 範囲内(バッファ週の先頭)
    await seedEvent(
      userA,
      "ev-buffer",
      "バッファ週の予定",
      addHours(timeMin, 1),
      addHours(timeMin, 2),
    );
    // 範囲内(表示週)
    await seedEvent(
      userA,
      "ev-in-week",
      "表示週の予定",
      addDays(timeMin, 10),
      addHours(addDays(timeMin, 10), 1),
    );
    // 範囲外(timeMax以降に開始)
    await seedEvent(
      userA,
      "ev-after",
      "範囲外(後)の予定",
      addHours(timeMax, 1),
      addHours(timeMax, 2),
    );
    // 範囲外(timeMinちょうどに終了 = end_at > timeMin を満たさない)
    await seedEvent(
      userA,
      "ev-before",
      "範囲外(前)の予定",
      addHours(timeMin, -1),
      timeMin,
    );

    const events = await fetchSyncedEvents(userA.client, BASE_DATE);

    expect(events.map((e) => e.title)).toEqual([
      "バッファ週の予定",
      "表示週の予定",
    ]);
    // 返却形はコンポーネントに渡す形(id / title / startAt / endAt)
    expect(events[0]).toMatchObject({
      title: "バッファ週の予定",
      startAt: addHours(timeMin, 1).toISOString(),
      endAt: addHours(timeMin, 2).toISOString(),
    });
    expect(typeof events[0]!.id).toBe("string");
  });

  it("S15: 別ユーザーの行は含まれない(RLS)", async () => {
    await seedEvent(
      userA,
      "ev-a",
      "Aの予定",
      addDays(timeMin, 10),
      addHours(addDays(timeMin, 10), 1),
    );
    await seedEvent(
      userB,
      "ev-b",
      "Bの予定",
      addDays(timeMin, 10),
      addHours(addDays(timeMin, 10), 1),
    );

    const events = await fetchSyncedEvents(userA.client, BASE_DATE);

    expect(events.map((e) => e.title)).toEqual(["Aの予定"]);
  });
});
