import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

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
  { view = "week", events = [PLAN] } = {},
) {
  render(
    <CalendarView
      events={events}
      timeEntries={timeEntries}
      runningEntry={runningEntry}
      viewParam={view}
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

describe("ブロックの title の適用範囲と読み上げ(G-99 レビュー対応)", () => {
  it("日表示では、時刻と差分が画面に出ているため title を付けない", () => {
    renderWeek([entry({ startAt: iso(9, 15) })], null, { view: "day" });

    expect(screen.queryByTitle(/09:00〜10:00/)).not.toBeInTheDocument();
    expect(screen.queryByTitle(/09:15〜10:00/)).not.toBeInTheDocument();
  });

  it("タイトルが空の予定ブロックも「(タイトルなし)」になる", () => {
    renderWeek([], null, { events: [{ ...PLAN, title: "" }] });

    expect(
      screen.getByTitle("(タイトルなし) 09:00〜10:00"),
    ).toBeInTheDocument();
  });

  it("編集できる実績では、重なる再計測ボタンの上でも同じ title が出るようブロック全体に付ける", () => {
    renderWeek([entry({})]);

    const block = screen.getByTestId("actual-block");
    expect(block).toHaveAttribute("title", "設計レビュー 09:00〜10:00");
    expect(block).toContainElement(
      screen.getByRole("button", { name: "設計レビューを再計測" }),
    );
  });

  it("編集できない(実行中の)実績は、title だけでなく読み上げ用の文字でも同じ内容を持つ", () => {
    renderWeek([], {
      id: "running",
      title: "実装",
      googleEventId: null,
      startAt: iso(11),
    });

    // 実行中タイマーのバーにも同じタイトルが出るため、実績ブロックの中に絞る
    const block = within(screen.getByTestId("actual-block"));
    expect(block.getByText("実装 11:00〜記録中(フリー)")).toHaveClass(
      "sr-only",
    );
    // 見えているタイトルは読み上げから外し、二重に読ませない
    expect(
      block.getByText("実装", { exact: true }).closest("[aria-hidden]"),
    ).not.toBeNull();
  });
});
