import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

import { CalendarView } from "@/components/calendar-view";
import { TrackView } from "@/components/track-view";

// 仕様書: docs/specs/G-91_タイマーの止め忘れ対策.md I4(両画面の結線)・I7

const iso = (hour: number, minute = 0) =>
  new Date(2026, 10, 24, hour, minute).toISOString();

const PLAN = {
  id: "row-1",
  googleEventId: "g-1",
  title: "設計レビュー",
  startAt: iso(9),
  endAt: iso(10),
};
const RUNNING = {
  id: "running",
  title: "設計レビュー",
  googleEventId: "g-1",
  startAt: iso(9),
};
const OVERRUN = "予定の終了(10:00)を過ぎて計測しています";

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 10, 24, 12, 0));
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ events: [] }))),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("止め忘れの警告の結線(G-91)", () => {
  it("I4: カレンダーの実行中バーに、紐づく予定の超過が出る", async () => {
    render(
      <CalendarView
        events={[PLAN]}
        timeEntries={[]}
        runningEntry={RUNNING}
        viewParam="day"
        dateParam="2026-11-24"
      />,
    );

    expect(await screen.findByText(OVERRUN)).toBeInTheDocument();
  });

  // 先頭に別の終了済み予定を置き、実行中に紐づく予定だけが選ばれることを確かめる
  const OTHER = {
    id: "row-0",
    googleEventId: "g-0",
    title: "別の予定",
    startAt: iso(7),
    endAt: iso(8),
  };

  it.each([
    [
      "カレンダー",
      (googleEventId: string | null) => (
        <CalendarView
          events={[OTHER, PLAN]}
          timeEntries={[]}
          runningEntry={{ ...RUNNING, googleEventId }}
          viewParam="day"
          dateParam="2026-11-24"
        />
      ),
    ],
    [
      "計測画面",
      (googleEventId: string | null) => (
        <TrackView
          events={[OTHER, PLAN]}
          timeEntries={[]}
          runningEntry={{ ...RUNNING, googleEventId }}
        />
      ),
    ],
  ])(
    "I4: %s は紐づく予定の超過だけを出し、フリー実行中には出さない",
    async (_name, view) => {
      const linked = render(view("g-1"));
      expect(await screen.findByText(OVERRUN)).toBeInTheDocument();
      expect(screen.queryByText(/予定の終了\(08:00\)/)).not.toBeInTheDocument();
      linked.unmount();

      render(view(null));
      expect(screen.queryByText(/予定の終了/)).not.toBeInTheDocument();
    },
  );

  it("I4: 計測画面のヒーローにも出る", async () => {
    render(
      <TrackView events={[PLAN]} timeEntries={[]} runningEntry={RUNNING} />,
    );

    expect(await screen.findByText(OVERRUN)).toBeInTheDocument();
  });

  it("I7: 「この日」の一覧で、長時間の実績にだけ目印が付く", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <CalendarView
        events={[]}
        timeEntries={[
          {
            id: "long",
            title: "止め忘れ",
            googleEventId: null,
            startAt: iso(0),
            endAt: iso(7),
          },
          {
            id: "short",
            title: "通常",
            googleEventId: null,
            startAt: iso(8),
            endAt: iso(9),
          },
        ]}
        runningEntry={null}
        viewParam="day"
        dateParam="2026-11-24"
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "選択日の詳細を開く" }),
    );

    const panel = within(screen.getByRole("complementary", { name: /詳細/ }));
    const marks = panel.getAllByText("止め忘れの可能性");
    expect(marks).toHaveLength(1);
    expect(marks[0]!.closest("li")).toHaveTextContent("止め忘れ");
    expect(marks[0]!.closest("li")).not.toHaveTextContent("通常");
  });
});
