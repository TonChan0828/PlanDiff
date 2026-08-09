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
import {
  fetchRunningEntry,
  fetchTimeEntriesInRange,
} from "@/lib/timer/entries";
import SummaryPage from "@/app/(app)/summary/page";

// 仕様書: docs/specs/P7-1_サマリーの日別ズレグラフ.md S32〜S36
//         docs/specs/P7-2_サマリーの時間内訳グラフ.md S30〜S34
//
// R-1(CLAUDE.md): 日時はローカルTZで構築する。

const fetchEventsMock = vi.mocked(fetchSyncedEventsInRange);
const fetchEntriesMock = vi.mocked(fetchTimeEntriesInRange);
const fetchRunningMock = vi.mocked(fetchRunningEntry);

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
  fetchRunningMock.mockResolvedValue(null);
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

describe("サマリーページの時間内訳グラフ", () => {
  it("S30: range=today でも時間の内訳は描画される(日別のズレが出ない期間でも出る)", async () => {
    fetchEventsMock.mockResolvedValue([plan("g-1", "設計", today, 9, 10)]);
    fetchEntriesMock.mockResolvedValue([
      entry("a-1", "g-1", "設計", today, 9, 11),
    ]);

    await renderSummary({ range: "today" });

    expect(
      screen.getByRole("heading", { name: "時間の内訳" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /日別のズレ/ })).toBeNull();
  });

  it("S31: DOM順が [日別のズレ] → [時間の内訳] → [予定ごとの内訳] になる", async () => {
    fetchEventsMock.mockResolvedValue([plan("g-1", "設計", weekStart, 9, 10)]);
    fetchEntriesMock.mockResolvedValue([
      entry("a-1", "g-1", "設計", weekStart, 9, 11),
    ]);

    await renderSummary({ range: "week", date: toDateParam(today) });

    const daily = screen.getByRole("heading", { name: "日別のズレ" });
    const breakdown = screen.getByRole("heading", { name: "時間の内訳" });
    const items = screen.getByRole("heading", { name: "予定ごとの内訳" });

    expect(
      daily.compareDocumentPosition(breakdown) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      breakdown.compareDocumentPosition(items) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("S32: 実績0件なら空メッセージになり、既存の空メッセージも従来どおり出る", async () => {
    await renderSummary({ range: "week", date: toDateParam(today) });

    expect(screen.getByText("この期間の実績はありません")).toBeInTheDocument();
    expect(screen.getByText("この期間の予定はありません")).toBeInTheDocument();
    expect(
      screen.getByText("割り込み・フリー作業はありません"),
    ).toBeInTheDocument();
  });

  it("S33: 実行中タイマーのタイトルが、now までの経過ぶんで内訳に載る", async () => {
    // 実行中タイマーは actualBlockInputs が now まで伸ばす。
    // 開始を「今日の0:05」に固定し、終了しない実績として渡す
    const startedAt = startOfDay(today);
    startedAt.setHours(0, 5, 0, 0);
    fetchRunningMock.mockResolvedValue({
      id: "running-1",
      title: "調査中の作業",
      googleEventId: null,
      startAt: startedAt.toISOString(),
    });

    await renderSummary({ range: "today" });

    const row = screen.getByTestId("breakdown-row");
    expect(row).toHaveTextContent("調査中の作業");
    expect(row).toHaveTextContent("割り込み");
  });

  it("S34: 367日のカスタム期間では、時間の内訳も描画されない", async () => {
    await renderSummary({
      range: "custom",
      from: toDateParam(today),
      to: toDateParam(addDays(today, 366)),
    });

    expect(screen.getByTestId("summary-range-error")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "時間の内訳" })).toBeNull();
  });
});
