import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { addDays, startOfDay } from "date-fns";
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

// 仕様書: docs/specs/P5-9_サマリーの任意期間表示.md S32〜S39

const fetchEventsMock = vi.mocked(fetchSyncedEventsInRange);
const fetchEntriesMock = vi.mocked(fetchTimeEntriesInRange);

const today = startOfDay(new Date());

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

describe("期間選択UI(S32〜S35)", () => {
  it("S32: タブ4種が並び、選択中のタブだけ aria-pressed=true になる", async () => {
    await renderSummary({ range: "today" });

    const tabs = ["今日", "今週", "今月", "カスタム"].map((label) =>
      screen.getByRole("link", { name: label }),
    );
    expect(tabs).toHaveLength(4);
    expect(tabs[0]).toHaveAttribute("aria-pressed", "true");
    expect(tabs[1]).toHaveAttribute("aria-pressed", "false");
    expect(tabs[2]).toHaveAttribute("aria-pressed", "false");
    expect(tabs[3]).toHaveAttribute("aria-pressed", "false");
  });

  it("S33: 今月を選ぶとヒーロー見出しと期間ラベルが月表示になる", async () => {
    await renderSummary({ range: "month", date: "2026-07-15" });

    expect(screen.getByText("今月のズレ")).toBeInTheDocument();
    expect(screen.getByTestId("summary-range-label")).toHaveTextContent(
      "2026年7月",
    );
  });

  it("S34: 週表示の ← → は前後の週へのリンクになる", async () => {
    await renderSummary({ range: "week", date: "2026-07-15" });

    expect(screen.getByRole("link", { name: "前の期間" })).toHaveAttribute(
      "href",
      "/summary?range=week&date=2026-07-08",
    );
    expect(screen.getByRole("link", { name: "次の期間" })).toHaveAttribute(
      "href",
      "/summary?range=week&date=2026-07-22",
    );
  });

  it("S35: カスタムでは前後ナビを出さず、フォームの初期値が from/to になる", async () => {
    await renderSummary({
      range: "custom",
      from: "2026-07-01",
      to: "2026-07-31",
    });

    expect(screen.queryByRole("link", { name: "前の期間" })).toBeNull();
    expect(screen.queryByRole("link", { name: "次の期間" })).toBeNull();
    expect(screen.getByLabelText("開始")).toHaveValue("2026-07-01");
    expect(screen.getByLabelText("終了")).toHaveValue("2026-07-31");
  });
});

describe("内訳の表示切替(S36〜S39)", () => {
  it("S36: 単日の期間では同タイトルでも集約されない", async () => {
    fetchEventsMock.mockResolvedValue([
      plan("g-1", "レビュー", today, 9, 10),
      plan("g-2", "レビュー", today, 14, 15),
    ]);
    fetchEntriesMock.mockResolvedValue([
      entry("e-1", "g-1", "レビュー", today, 9, 10),
      entry("e-2", "g-2", "レビュー", today, 14, 15),
    ]);

    await renderSummary({ range: "today", date: toDateParam(today) });

    expect(screen.queryAllByTestId("gap-grouped-item")).toHaveLength(0);
    expect(screen.getAllByText("レビュー")).toHaveLength(2);
  });

  it("S37: 複数日の期間では同タイトルが1行に集約され、件数と平均開始遅延が出る", async () => {
    const day1 = today;
    const day2 = addDays(today, 1);
    fetchEventsMock.mockResolvedValue([
      plan("g-1", "レビュー", day1, 9, 10),
      plan("g-2", "レビュー", day2, 9, 10),
    ]);
    fetchEntriesMock.mockResolvedValue([
      // 予定9:00に対し 10分遅れ / 20分遅れ → 平均15分遅れ
      {
        ...entry("e-1", "g-1", "レビュー", day1, 9, 10),
        startAt: isoAt(day1, 9, 10),
      },
      {
        ...entry("e-2", "g-2", "レビュー", day2, 9, 10),
        startAt: isoAt(day2, 9, 20),
      },
    ]);

    await renderSummary({
      range: "custom",
      from: toDateParam(day1),
      to: toDateParam(day2),
    });

    const rows = screen.getAllByTestId("gap-grouped-item");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("レビュー");
    expect(rows[0]).toHaveTextContent("2件");
    expect(screen.getByTestId("gap-grouped-start-delay")).toHaveTextContent(
      "着手 予定より平均 +15分遅れ",
    );
  });

  it("S38: 367日の期間は集計を出さずエラー文言だけを表示する", async () => {
    await renderSummary({
      range: "custom",
      from: "2026-01-01",
      to: "2027-01-02",
    });

    expect(screen.getByTestId("summary-range-error")).toHaveTextContent(
      "期間は最大366日までです",
    );
    expect(screen.queryByTestId("gap-hero-value")).toBeNull();
    expect(fetchEventsMock).not.toHaveBeenCalled();
    expect(fetchEntriesMock).not.toHaveBeenCalled();
  });

  it("S39: 予定0件の期間では空メッセージを表示する", async () => {
    await renderSummary({ range: "month", date: "2026-07-15" });

    expect(screen.getByText("この期間の予定はありません")).toBeInTheDocument();
  });
});
