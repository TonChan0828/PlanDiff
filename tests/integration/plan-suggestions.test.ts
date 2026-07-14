import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TZDate } from "@date-fns/tz";
import { createAppEvent } from "@/lib/calendar/app-events";
import {
  createRecurringRule,
  materializeRecurringInstances,
  RECURRING_ID_PREFIX,
} from "@/lib/calendar/recurring";
import { fetchSuggestionSourceEntries } from "@/lib/timer/entries";
import {
  createAdminClient,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "./helpers";

// 仕様書: docs/specs/P5-2_実績からの予定提案.md S20〜S23
// 提案の元データ取得(fetchSuggestionSourceEntries)と、受け入れ相当の書き込み
// (単発=createAppEvent / 毎週=createRecurringRule→実体化)をローカルSupabaseで検証する

const admin = createAdminClient();
let userA: TestUser;
let userB: TestUser;

// 2026-07-08(水)。週は月曜始まりで 7/6〜7/12。
// fetchSuggestionSourceEntries の取得範囲は概ね「週開始−29日 〜 週開始+1日」
// (サーバーTZで概算)のため、境界から十分離れた日付で在圏/圏外を検証する
const BASE_DATE = new Date("2026-07-08T00:00:00.000Z");

function jstToUtcIso(dateOnly: string, hour: number, minute: number): string {
  const [year, month, day] = dateOnly.split("-").map(Number);
  return new Date(
    new TZDate(
      year!,
      month! - 1,
      day!,
      hour,
      minute,
      0,
      "Asia/Tokyo",
    ).getTime(),
  ).toISOString();
}

async function insertEntry(
  user: TestUser,
  title: string,
  startAt: string,
  endAt: string | null,
) {
  const { error } = await user.client.from("time_entries").insert({
    user_id: user.id,
    title,
    start_at: startAt,
    end_at: endAt,
  });
  expect(error).toBeNull();
}

beforeAll(async () => {
  userA = await createTestUser(admin, "提案ユーザーA");
  userB = await createTestUser(admin, "提案ユーザーB");
});

afterAll(async () => {
  await deleteTestUser(admin, userA.id);
  await deleteTestUser(admin, userB.id);
});

beforeEach(async () => {
  for (const user of [userA, userB]) {
    await user.client.from("time_entries").delete().neq("title", "");
    await user.client.from("synced_events").delete().neq("title", "");
    await user.client.from("recurring_rules").delete().neq("title", "");
  }
});

describe("提案元データの取得(S20)", () => {
  it("S20: 範囲内の完了実績のみ返る(実行中タイマー・範囲外は含まれない)", async () => {
    // 範囲内(表示週の10日前・完了)
    await insertEntry(
      userA,
      "範囲内の実績",
      jstToUtcIso("2026-06-26", 10, 0),
      jstToUtcIso("2026-06-26", 10, 30),
    );
    // 実行中タイマー(end_at IS NULL)は対象外
    await insertEntry(userA, "実行中", jstToUtcIso("2026-07-04", 9, 0), null);
    // 4週窓より古い実績は対象外
    await insertEntry(
      userA,
      "古すぎる実績",
      jstToUtcIso("2026-05-20", 10, 0),
      jstToUtcIso("2026-05-20", 10, 30),
    );
    // 表示週開始より十分後(週の半ば以降)の実績は対象外
    await insertEntry(
      userA,
      "未来の実績",
      jstToUtcIso("2026-07-20", 10, 0),
      jstToUtcIso("2026-07-20", 10, 30),
    );

    const entries = await fetchSuggestionSourceEntries(userA.client, BASE_DATE);

    expect(entries.map((entry) => entry.title)).toEqual(["範囲内の実績"]);
    expect(entries[0]?.endAt).toBe(jstToUtcIso("2026-06-26", 10, 30));
  });
});

describe("受け入れ: この週に追加(S21)", () => {
  it("S21: createAppEvent経由で synced_events に source='app' の行が作られる", async () => {
    const result = await createAppEvent(userA.client, {
      title: "朝会",
      startAt: jstToUtcIso("2026-07-07", 10, 0),
      endAt: jstToUtcIso("2026-07-07", 10, 30),
    });
    expect(result.ok).toBe(true);

    const { data, error } = await userA.client
      .from("synced_events")
      .select("google_event_id, title, start_at, end_at, source")
      .eq("title", "朝会");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.source).toBe("app");
    expect(data?.[0]?.google_event_id).toMatch(/^app:/);
  });
});

describe("受け入れ: 毎週にする(S22)", () => {
  it("S22: 定期ルールが作成され、表示週の該当曜日に rec: キーで実体化される", async () => {
    const result = await createRecurringRule(userA.client, {
      title: "週次レビュー",
      pattern: "weekly",
      weekdays: [2], // 火曜
      startTime: "10:00",
      endTime: "10:30",
      timezone: "Asia/Tokyo",
      startsOn: "2026-07-07",
      endsOn: null,
    });
    expect(result.ok).toBe(true);

    const { data: rules } = await userA.client
      .from("recurring_rules")
      .select("id, pattern, weekdays")
      .eq("title", "週次レビュー");
    expect(rules).toHaveLength(1);
    expect(rules?.[0]?.pattern).toBe("weekly");

    await materializeRecurringInstances(userA.client, BASE_DATE);

    const { data: instances } = await userA.client
      .from("synced_events")
      .select("google_event_id, start_at, source")
      .like("google_event_id", `${RECURRING_ID_PREFIX}${rules?.[0]?.id}:%`)
      .order("start_at", { ascending: true });
    // 表示範囲(週±1週間)の火曜 7/7・7/14 が実体化される
    const dates = (instances ?? []).map((row) =>
      (row.google_event_id as string).split(":").pop(),
    );
    expect(dates).toContain("2026-07-07");
    expect(dates).toContain("2026-07-14");
    expect(instances?.every((row) => row.source === "app")).toBe(true);
  });
});

describe("RLS(S23)", () => {
  it("S23: 他ユーザーの実績は取得されない", async () => {
    await insertEntry(
      userB,
      "他人の実績",
      jstToUtcIso("2026-06-30", 10, 0),
      jstToUtcIso("2026-06-30", 10, 30),
    );
    await insertEntry(
      userA,
      "自分の実績",
      jstToUtcIso("2026-06-30", 10, 0),
      jstToUtcIso("2026-06-30", 10, 30),
    );

    const entries = await fetchSuggestionSourceEntries(userA.client, BASE_DATE);

    expect(entries.map((entry) => entry.title)).toEqual(["自分の実績"]);
  });
});
