import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/timer/actions", () => ({
  startTimerAction: vi.fn(),
  stopTimerAction: vi.fn(),
  updateTimeEntryAction: vi.fn(),
  deleteTimeEntryAction: vi.fn(),
}));

import { CalendarView } from "@/components/calendar-view";
import type { RunningEntry, TimeEntryItem } from "@/lib/timer/types";

// 仕様書: docs/specs/G-99_細かい表示の改善.md F2〜F4
// 週表示の小さいブロックは文字が省略されるため、title 属性で全文と時刻を読めるようにする。
// 日時はローカルTZで組み立て、現在時刻は固定する(R-1)

const iso = (hour: number, minute = 0, day = 7) =>
  new Date(2026, 6, day, hour, minute).toISOString();

const PLAN = {
  id: "row-1",
  googleEventId: "g-1",
  title: "設計レビュー",
  startAt: iso(9),
  endAt: iso(10),
};

const entry = (overrides: Partial<TimeEntryItem>): TimeEntryItem => ({
  id: "e1",
  title: "設計レビュー",
  googleEventId: "g-1",
  startAt: iso(9),
  endAt: iso(10),
  ...overrides,
});

function renderWeek(
  timeEntries: TimeEntryItem[],
  runningEntry: RunningEntry | null = null,
) {
  render(
    <CalendarView
      events={[PLAN]}
      timeEntries={timeEntries}
      runningEntry={runningEntry}
      viewParam="week"
      dateParam="2026-07-07"
    />,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 6, 7, 12, 0));
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ events: [] }))),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("週表示のブロックの title(G-99)", () => {
  it("F2: 予定ブロックの title にタイトル全文と時刻が入る", () => {
    renderWeek([]);

    expect(screen.getByTitle("設計レビュー 09:00〜10:00")).toBeInTheDocument();
  });

  it("F3: 紐づく実績ブロックの title に、タイトル・時刻・差分が入る", () => {
    renderWeek([entry({ startAt: iso(9, 15), endAt: iso(10, 20) })]);

    expect(
      screen.getByTitle("設計レビュー 09:15〜10:20(+15分 遅れ、+20分 超過)"),
    ).toBeInTheDocument();
  });

  it("F3: フリー実績の title には「フリー」が入る", () => {
    renderWeek([
      entry({
        title: "英語の学習",
        googleEventId: null,
        startAt: iso(11),
        endAt: iso(11, 10),
      }),
    ]);

    expect(
      screen.getByTitle("英語の学習 11:00〜11:10(フリー)"),
    ).toBeInTheDocument();
  });

  it("F4: タイトルが空の実績は「(タイトルなし)」になる", () => {
    renderWeek([
      entry({
        title: "",
        googleEventId: null,
        startAt: iso(11),
        endAt: iso(11, 30),
      }),
    ]);

    expect(
      screen.getByTitle("(タイトルなし) 11:00〜11:30(フリー)"),
    ).toBeInTheDocument();
  });

  it("F4(境界): 日をまたぐ実績は日付も入れる", () => {
    renderWeek([
      entry({
        title: "夜の作業",
        googleEventId: null,
        startAt: iso(23, 30, 6),
        endAt: iso(0, 30, 7),
      }),
    ]);

    // 日またぎのブロックは2つの日の列に分かれて描かれ、どちらも同じ全体の時刻を示す
    expect(
      screen.getAllByTitle("夜の作業 7/6 23:30〜7/7 00:30(フリー)"),
    ).toHaveLength(2);
  });

  it("F4: 実行中の実績は、終了時刻の代わりに「記録中」と表示する", () => {
    renderWeek([], {
      id: "running",
      title: "実装",
      googleEventId: null,
      startAt: iso(11),
    });

    expect(screen.getByTitle("実装 11:00〜記録中(フリー)")).toBeInTheDocument();
  });
});
