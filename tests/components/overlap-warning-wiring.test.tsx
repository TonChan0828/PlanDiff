import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

import { CalendarView } from "@/components/calendar-view";
import { TrackView } from "@/components/track-view";

// 仕様書: docs/specs/G-94_予定の時間の重なりの警告.md H7(両画面のパネルに予定が渡る)

const iso = (hour: number, minute = 0) =>
  new Date(2026, 10, 24, hour, minute).toISOString();

const PLAN = {
  id: "row-1",
  googleEventId: "app:row-1",
  title: "英語学習",
  startAt: iso(10),
  endAt: iso(11),
};

const WARNING = "ほかの予定と時間が重なっています(保存はできます)";

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

describe("重なりの警告の結線(G-94 H7)", () => {
  it("カレンダーの予定追加パネルに、画面の予定が渡る", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <CalendarView
        events={[PLAN]}
        timeEntries={[]}
        runningEntry={null}
        viewParam="day"
        dateParam="2026-11-24"
      />,
    );

    await user.click(screen.getByRole("button", { name: "予定を追加" }));
    await screen.findByRole("dialog");
    fireEvent.change(screen.getByLabelText("開始時刻"), {
      target: { value: "2026-11-24T10:30" },
    });
    fireEvent.change(screen.getByLabelText("終了時刻"), {
      target: { value: "2026-11-24T11:30" },
    });

    expect(screen.getByText(WARNING)).toBeInTheDocument();
  });

  it("計測画面の「予定にする」パネルに、画面の予定が渡る", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    // 「予定にする」の初期値は翌日の同じ時刻(buildPromotionDefaults)のため、比べる予定も翌日に置く
    const tomorrow = (hour: number) =>
      new Date(2026, 10, 25, hour, 0).toISOString();
    render(
      <TrackView
        events={[{ ...PLAN, startAt: tomorrow(10), endAt: tomorrow(11) }]}
        timeEntries={[
          {
            id: "free-1",
            title: "調査",
            googleEventId: null,
            startAt: iso(10, 15),
            endAt: iso(10, 45),
          },
        ]}
        runningEntry={null}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /予定にする/ }));

    expect(await screen.findByText(WARNING)).toBeInTheDocument();
  });
});
