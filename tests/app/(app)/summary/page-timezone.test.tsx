import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, startOfDay } from "date-fns";
import type { SyncRange } from "@/lib/google/sync-range";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/calendar/events", () => ({ fetchSyncedEventsInRange: vi.fn() }));
vi.mock("@/lib/calendar/recurring", () => ({
  materializeRecurringInstances: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/timer/entries", () => ({
  fetchTimeEntriesInRange: vi.fn(),
  fetchRunningEntry: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/time/timezone-cookie.server", () => ({
  readTimezoneCookie: vi.fn(),
}));

import { fetchSyncedEventsInRange } from "@/lib/calendar/events";
import { fetchTimeEntriesInRange } from "@/lib/timer/entries";
import { readTimezoneCookie } from "@/lib/time/timezone-cookie.server";
import SummaryPage from "@/app/(app)/summary/page";

// 仕様書: docs/specs/P8-3_サマリーの日付またぎとTZ非対称の是正.md S16
// R-1: 検証したいのは「TZ Cookieの値がクエリ範囲に正しく反映されるか」であり、
// ホストのローカルTZには依存させない。Cookieありのケースは Date.UTC の絶対時刻から
// 期待値を計算し、Cookieなし(フォールバック)のケースは本番コードと同じ
// date-fns の計算をテスト側でも行って比較する(ハードコードしない)。
// TZDate.toISOString() はオフセット付き文字列("+14:00"等)を返し、Z正規化された
// 文字列とは表記が異なるが瞬時値としては等価なため、文字列比較ではなく getTime() で比較する

const fetchEventsMock = vi.mocked(fetchSyncedEventsInRange);
const fetchEntriesMock = vi.mocked(fetchTimeEntriesInRange);
const readTimezoneCookieMock = vi.mocked(readTimezoneCookie);

// 2026-08-11T12:00:00Z: 東京(UTC+9)では8/11 21:00、Pacific/Kiritimati(UTC+14)では
// 8/12 02:00と暦日が割れる瞬間
const FAKE_NOW = new Date(Date.UTC(2026, 7, 11, 12, 0, 0));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FAKE_NOW);
  vi.clearAllMocks();
  fetchEventsMock.mockResolvedValue([]);
  fetchEntriesMock.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

function syncRangeArgOf(mock: { mock: { calls: unknown[][] } }): SyncRange {
  return mock.mock.calls[0]![1] as SyncRange;
}

describe("SummaryPage のTZ Cookie反映(S16)", () => {
  it("S16: TZ CookieがあるときはそのタイムゾーンでrangeToday=今日の範囲を計算する", async () => {
    readTimezoneCookieMock.mockResolvedValue("Pacific/Kiritimati");

    await SummaryPage({ searchParams: Promise.resolve({ range: "today" }) });

    // Pacific/Kiritimati での 8/12 00:00 は UTC の 8/11 10:00
    const expectedMin = Date.UTC(2026, 7, 11, 10, 0, 0);
    const expectedMax = Date.UTC(2026, 7, 12, 10, 0, 0);

    const eventsRange = syncRangeArgOf(fetchEventsMock);
    expect(new Date(eventsRange.timeMin).getTime()).toBe(expectedMin);
    expect(new Date(eventsRange.timeMax).getTime()).toBe(expectedMax);

    const entriesRange = syncRangeArgOf(fetchEntriesMock);
    expect(new Date(entriesRange.timeMin).getTime()).toBe(expectedMin);
    expect(new Date(entriesRange.timeMax).getTime()).toBe(expectedMax);
  });

  it("S16: TZ Cookieがないときは従来どおりサーバーのタイムゾーンで計算する", async () => {
    readTimezoneCookieMock.mockResolvedValue(null);

    await SummaryPage({ searchParams: Promise.resolve({ range: "today" }) });

    // 本番コードと同じ計算(実行環境のローカルTZ)をテスト側でも行い、
    // ハードコードせずに期待値を導く
    const today = startOfDay(FAKE_NOW);
    const expectedMin = today.getTime();
    const expectedMax = addDays(today, 1).getTime();

    const eventsRange = syncRangeArgOf(fetchEventsMock);
    expect(new Date(eventsRange.timeMin).getTime()).toBe(expectedMin);
    expect(new Date(eventsRange.timeMax).getTime()).toBe(expectedMax);
  });
});
