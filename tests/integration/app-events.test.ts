import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createAppEvent,
  deleteAppEvent,
  updateAppEvent,
  APP_EVENT_ID_PREFIX,
} from "@/lib/calendar/app-events";
import {
  createAdminClient,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "./helpers";

// 仕様書: docs/specs/P2-5_アプリ内予定とGoogle連携凍結.md S11〜S15
// アプリ予定CRUDを、ローカルSupabase+RLS+sourceガードで検証する

const admin = createAdminClient();
let userA: TestUser;

const START_AT = "2026-07-10T01:00:00.000Z";
const END_AT = "2026-07-10T02:00:00.000Z";

async function fetchEventRows(user: TestUser) {
  const { data, error } = await user.client
    .from("synced_events")
    .select("id, source, google_event_id, title, start_at, end_at")
    .order("start_at", { ascending: true });
  expect(error).toBeNull();
  return data ?? [];
}

async function seedGoogleRow(user: TestUser, googleEventId = "g-1") {
  const { data, error } = await user.client
    .from("synced_events")
    .insert({
      user_id: user.id,
      google_event_id: googleEventId,
      title: "Google由来の予定",
      start_at: START_AT,
      end_at: END_AT,
    })
    .select("id")
    .single();
  expect(error).toBeNull();
  return data!.id as string;
}

beforeAll(async () => {
  userA = await createTestUser(admin, "アプリ予定テスト");
});

afterAll(async () => {
  await deleteTestUser(admin, userA.id);
});

beforeEach(async () => {
  await admin.from("synced_events").delete().eq("user_id", userA.id);
  await admin.from("time_entries").delete().eq("user_id", userA.id);
});

describe("アプリ予定の作成(S11/S12)", () => {
  it("S11: createAppEvent で source='app'・google_event_id が app: 始まりの行が作成される", async () => {
    const result = await createAppEvent(userA.client, {
      title: "実装作業",
      startAt: START_AT,
      endAt: END_AT,
    });

    expect(result.ok).toBe(true);
    const rows = await fetchEventRows(userA);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.source).toBe("app");
    expect(rows[0]!.google_event_id).toMatch(
      new RegExp(`^${APP_EVENT_ID_PREFIX}`),
    );
    expect(rows[0]!.title).toBe("実装作業");
    expect(new Date(rows[0]!.start_at).toISOString()).toBe(START_AT);
    expect(new Date(rows[0]!.end_at).toISOString()).toBe(END_AT);
  });

  it("S12: startAt >= endAt はサーバー側バリデーションで拒否され、行が作られない", async () => {
    const equal = await createAppEvent(userA.client, {
      title: "ゼロ長",
      startAt: START_AT,
      endAt: START_AT,
    });
    const reversed = await createAppEvent(userA.client, {
      title: "逆転",
      startAt: END_AT,
      endAt: START_AT,
    });

    expect(equal.ok).toBe(false);
    expect(reversed.ok).toBe(false);
    expect(await fetchEventRows(userA)).toHaveLength(0);
  });
});

describe("アプリ予定の更新・削除とsourceガード(S13/S14/S15)", () => {
  it("S13: updateAppEvent でタイトル・時刻が更新され、google_event_id は変わらない", async () => {
    await createAppEvent(userA.client, {
      title: "実装作業",
      startAt: START_AT,
      endAt: END_AT,
    });
    const [row] = await fetchEventRows(userA);
    const newEnd = "2026-07-10T03:30:00.000Z";

    const result = await updateAppEvent(userA.client, row!.id as string, {
      title: "実装作業(延長)",
      startAt: START_AT,
      endAt: newEnd,
    });

    expect(result.ok).toBe(true);
    const [updated] = await fetchEventRows(userA);
    expect(updated!.title).toBe("実装作業(延長)");
    expect(new Date(updated!.end_at).toISOString()).toBe(newEnd);
    expect(updated!.google_event_id).toBe(row!.google_event_id);
  });

  it("S14: source='google' の行は updateAppEvent / deleteAppEvent の対象にならない", async () => {
    const googleRowId = await seedGoogleRow(userA);

    const updateResult = await updateAppEvent(userA.client, googleRowId, {
      title: "書き換え試行",
      startAt: START_AT,
      endAt: END_AT,
    });
    const deleteResult = await deleteAppEvent(userA.client, googleRowId);

    expect(updateResult.ok).toBe(false);
    expect(deleteResult.ok).toBe(false);
    const rows = await fetchEventRows(userA);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe("Google由来の予定");
  });

  it("S15: deleteAppEvent で予定行は消え、紐づく time_entries は google_event_id を保持したまま残る", async () => {
    await createAppEvent(userA.client, {
      title: "実装作業",
      startAt: START_AT,
      endAt: END_AT,
    });
    const [row] = await fetchEventRows(userA);
    const eventKey = row!.google_event_id as string;
    const { error: entryError } = await userA.client
      .from("time_entries")
      .insert({
        user_id: userA.id,
        title: "実装作業",
        google_event_id: eventKey,
        start_at: START_AT,
        end_at: END_AT,
      });
    expect(entryError).toBeNull();

    const result = await deleteAppEvent(userA.client, row!.id as string);

    expect(result.ok).toBe(true);
    expect(await fetchEventRows(userA)).toHaveLength(0);
    const { data: entries } = await userA.client
      .from("time_entries")
      .select("google_event_id")
      .eq("user_id", userA.id);
    expect(entries).toHaveLength(1);
    expect(entries![0]!.google_event_id).toBe(eventKey);
  });
});
