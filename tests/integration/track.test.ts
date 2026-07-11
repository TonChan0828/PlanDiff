import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addDays, subHours, subMinutes } from "date-fns";
import { createAppEvent } from "@/lib/calendar/app-events";
import { fetchRunningEntry, fetchTimeEntries } from "@/lib/timer/entries";
import { startTimer } from "@/lib/timer/service";
import { buildPromotionDefaults } from "@/lib/track/promotion";
import {
  createAdminClient,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "./helpers";

// 仕様書: docs/specs/P2-6_計測画面.md S10〜S12
// /track ページ(Server Component)のデータ取得と、計測画面から使うServer Action配下の
// ロジックを、ローカルSupabase+RLSで検証する

const admin = createAdminClient();
let user: TestUser;

beforeAll(async () => {
  user = await createTestUser(admin, "計測ユーザー");
});

afterAll(async () => {
  await deleteTestUser(admin, user.id);
});

beforeEach(async () => {
  await admin
    .from("time_entries")
    .delete()
    .gte("start_at", "1970-01-01T00:00:00Z");
  await admin
    .from("synced_events")
    .delete()
    .gte("synced_at", "1970-01-01T00:00:00Z");
});

async function seedEntry(
  title: string,
  startAt: Date,
  endAt: Date | null,
  googleEventId: string | null = null,
): Promise<void> {
  const { error } = await user.client.from("time_entries").insert({
    user_id: user.id,
    title,
    google_event_id: googleEventId,
    start_at: startAt.toISOString(),
    end_at: endAt ? endAt.toISOString() : null,
  });
  expect(error).toBeNull();
}

describe("計測画面のデータ取得(S10)", () => {
  it("S10: 実行中タイマー1件と当日実績2件がある状態で、実行中と確定済み実績が取得できる", async () => {
    const now = new Date();
    await seedEntry("朝の作業", subHours(now, 4), subHours(now, 3));
    await seedEntry("昼の作業", subHours(now, 2), subHours(now, 1), "g-plan");
    await seedEntry("実行中の作業", subMinutes(now, 10), null);

    const [running, entries] = await Promise.all([
      fetchRunningEntry(user.client),
      fetchTimeEntries(user.client, now),
    ]);

    expect(running).toMatchObject({
      title: "実行中の作業",
      googleEventId: null,
    });
    // fetchTimeEntries は start_at 昇順で返す
    expect(entries.map((e) => e.title)).toEqual(["朝の作業", "昼の作業"]);
    // 確定済みリストに実行中(end_at IS NULL)は含まれない
    expect(entries.every((e) => e.endAt !== null)).toBe(true);
  });
});

describe("計測画面からのタイマー開始(S11)", () => {
  it("S11: 実行中タイマーがある状態で予定連動タイマーを開始すると、既存は自動停止し実行中は常に1本", async () => {
    const now = new Date();
    await seedEntry("先行タイマー", subMinutes(now, 30), null);

    const result = await startTimer(user.client, {
      googleEventId: "g-next",
      title: "次の予定",
    });
    expect(result).toEqual({ ok: true });

    const running = await fetchRunningEntry(user.client);
    expect(running).toMatchObject({
      title: "次の予定",
      googleEventId: "g-next",
    });

    // 先行タイマーは実績として確定している(end_at NOT NULL)
    const { data: rows, error } = await user.client
      .from("time_entries")
      .select("title, end_at")
      .eq("title", "先行タイマー");
    expect(error).toBeNull();
    expect(rows).toHaveLength(1);
    expect(rows![0]!.end_at).not.toBeNull();
  });
});

describe("フリー実績の予定への昇格(S12)", () => {
  it("S12: 昇格初期値(翌日同時刻・同じ長さ)で予定を作成すると synced_events に source='app' の行ができる", async () => {
    const start = subHours(new Date(), 3);
    const end = subHours(new Date(), 2);
    const defaults = buildPromotionDefaults({
      title: "リファクタリング",
      startAt: start.toISOString(),
      endAt: end.toISOString(),
    });

    const result = await createAppEvent(user.client, defaults);
    expect(result).toEqual({ ok: true });

    const { data: rows, error } = await user.client
      .from("synced_events")
      .select("source, google_event_id, title, start_at, end_at")
      .eq("source", "app");
    expect(error).toBeNull();
    expect(rows).toHaveLength(1);
    expect(rows![0]).toMatchObject({
      source: "app",
      title: "リファクタリング",
    });
    expect(rows![0]!.google_event_id).toMatch(/^app:/);
    expect(new Date(rows![0]!.start_at as string).toISOString()).toBe(
      addDays(start, 1).toISOString(),
    );
    expect(new Date(rows![0]!.end_at as string).toISOString()).toBe(
      addDays(end, 1).toISOString(),
    );
  });
});
