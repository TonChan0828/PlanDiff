import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { addDays, startOfDay, startOfWeek } from "date-fns";
import { toDateParam } from "@/lib/calendar/view-date";

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

import { fetchSyncedEventsInRange } from "@/lib/calendar/events";
import { fetchTimeEntriesInRange } from "@/lib/timer/entries";
import SummaryPage from "@/app/(app)/summary/page";

// 仕様書: docs/specs/P7-1_サマリーの日別ズレグラフ.md S32〜S36
//
// R-1(CLAUDE.md): 日時はローカルTZで構築する。

const fetchEventsMock = vi.mocked(fetchSyncedEventsInRange);
const fetchEntriesMock = vi.mocked(fetchTimeEntriesInRange);

const today = startOfDay(new Date());
/** 今週の月曜。週レンジのテストで確実に期間内へ入れるために使う */
const weekStart = startOfWeek(today, { weekStartsOn: 1 });

function isoAt(day: Date, hour: number, minute = 0): string {
  const date = startOfDay(day);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function plan(
  googleEventId: string,
  title: string,
  day: Date,
  startHour: number,
  endHour: number,
) {
  return {
    id: `row-${googleEventId}`,
    googleEventId,
    title,
    startAt: isoAt(day, startHour),
    endAt: isoAt(day, endHour),
    source: "app" as const,
  };
}

function entry(
  id: string,
  googleEventId: string,
  title: string,
  day: Date,
  startHour: number,
  endHour: number,
) {
  return {
    id,
    title,
    googleEventId,
    startAt: isoAt(day, startHour),
    endAt: isoAt(day, endHour),
  };
}

async function renderSummary(params: Record<string, string> = {}) {
  render(await SummaryPage({ searchParams: Promise.resolve(params) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchEventsMock.mockResolvedValue([]);
  fetchEntriesMock.mockResolvedValue([]);
});

describe("サマリーページの日別ズレグラフ", () => {
  it("S32: range=today では日別のズレが描画されない", async () => {
    fetchEventsMock.mockResolvedValue([plan("g-1", "設計", today, 9, 10)]);
    fetchEntriesMock.mockResolvedValue([
      entry("a-1", "g-1", "設計", today, 9, 11),
    ]);

    await renderSummary({ range: "today" });

    expect(screen.queryByRole("img", { name: /日別のズレ/ })).toBeNull();
  });

  it("S33: range=week では日別のズレが描画され、既存の「予定ごとの内訳」より前に置かれる", async () => {
    fetchEventsMock.mockResolvedValue([plan("g-1", "設計", weekStart, 9, 10)]);
    fetchEntriesMock.mockResolvedValue([
      entry("a-1", "g-1", "設計", weekStart, 9, 11),
    ]);

    await renderSummary({ range: "week", date: toDateParam(today) });

    const chart = screen.getByRole("img", { name: /日別のズレ/ });
    const itemsHeading = screen.getByRole("heading", {
      name: "予定ごとの内訳",
    });

    // DOM順で chart が itemsHeading より前にあること
    expect(
      chart.compareDocumentPosition(itemsHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("S34: 単日のカスタム期間では日別のズレが描画されない", async () => {
    fetchEventsMock.mockResolvedValue([plan("g-1", "設計", today, 9, 10)]);

    await renderSummary({
      range: "custom",
      from: toDateParam(today),
      to: toDateParam(today),
    });

    expect(screen.queryByRole("img", { name: /日別のズレ/ })).toBeNull();
  });

  it("S35: 予定・実績0件の月表示でも、グラフは描画され既存の空メッセージも従来どおり出る", async () => {
    await renderSummary({ range: "month", date: toDateParam(today) });

    const chart = screen.getByRole("img", { name: /日別のズレ/ });
    expect(chart.getAttribute("aria-label")).toContain(
      "ズレのある日はありません",
    );
    expect(screen.getByText("この期間の予定はありません")).toBeInTheDocument();
    expect(
      screen.getByText("割り込み・フリー作業はありません"),
    ).toBeInTheDocument();
  });

  it("S36: 367日のカスタム期間ではエラー文言のみが出て、グラフは描画されない", async () => {
    await renderSummary({
      range: "custom",
      from: toDateParam(today),
      to: toDateParam(addDays(today, 366)),
    });

    expect(screen.getByTestId("summary-range-error")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /日別のズレ/ })).toBeNull();
  });
});
