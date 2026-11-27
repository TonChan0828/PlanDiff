import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

import { CalendarView } from "@/components/calendar-view";

// 仕様書: docs/specs/G-104_週表示の長時間実績の省略表示.md J4〜J6
// 日時はローカルTZで組み立て、現在時刻を固定する(R-1)

const iso = (hour: number, minute = 0, day = 7) =>
  new Date(2026, 6, day, hour, minute).toISOString();

const PLAN = {
  id: "row-1",
  googleEventId: "g-1",
  title: "副業",
  startAt: iso(6),
  endAt: iso(6, 30),
};

const LONG = {
  id: "long",
  title: "副業",
  googleEventId: "g-1",
  startAt: iso(6),
  endAt: iso(18, 38),
};

function renderView(view: "week" | "day", entries = [LONG]) {
  render(
    <CalendarView
      events={[PLAN]}
      timeEntries={entries}
      runningEntry={null}
      viewParam={view}
      dateParam="2026-07-07"
    />,
  );
}

const heightPercentOf = (element: HTMLElement) =>
  Number.parseFloat(element.style.height);

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 6, 9, 12, 0));
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ events: [] }))),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("週表示の長時間実績の省略(G-104)", () => {
  it("J4: 週表示は2時間ぶんに省略して実際の長さを示し、超過の斜線は省略ブロックを超えない", () => {
    renderView("week");

    const block = screen.getByTestId("actual-block");
    expect(within(block).getByText("省略 12時間38分")).toBeInTheDocument();
    // 後から描く超過の斜線に隠れないよう、文字は前面に出して下地を敷く
    expect(within(block).getByText("省略 12時間38分")).toHaveClass(
      "relative",
      "z-[1]",
      "bg-brand",
    );
    expect(within(block).getByTestId("long-entry-break")).toBeInTheDocument();
    expect(heightPercentOf(block)).toBeCloseTo((120 / 1440) * 100);
    // 超過の斜線は予定の終了 6:30 から、省略ブロックの下端 8:00 まで
    const stripe = screen.getByTestId("gap-overrun");
    expect(Number.parseFloat(stripe.style.top)).toBeCloseTo((390 / 1440) * 100);
    expect(heightPercentOf(stripe)).toBeCloseTo((90 / 1440) * 100);
  });

  it("J4: 日表示は実際の長さのまま", () => {
    renderView("day");

    const block = screen.getByTestId("actual-block");
    expect(heightPercentOf(block)).toBeCloseTo((758 / 1440) * 100);
    expect(within(block).queryByText(/省略/)).not.toBeInTheDocument();
    expect(
      within(block).queryByTestId("long-entry-break"),
    ).not.toBeInTheDocument();
  });

  it("J5: 読み上げ名と title は実際の時刻で、タップした編集パネルの時刻も実際の値", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderView("week");

    expect(
      screen.getByTitle("副業 06:00〜18:38(+728分 超過)"),
    ).toBeInTheDocument();
    const button = screen.getByRole("button", {
      name: "副業の実績を編集(+728分 超過) 06:00〜18:38",
    });
    await user.click(button);

    await screen.findByRole("dialog");
    expect(screen.getByLabelText("終了時刻")).toHaveValue("2026-07-07T18:38");
  });

  it("J6: 日をまたぐ省略対象は、続きの日に印を出し、タップで同じ編集パネルが開く", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderView("week", [
      {
        ...LONG,
        googleEventId: null as never,
        endAt: iso(7, 0, 8),
        startAt: iso(20),
      },
    ]);

    const blocks = screen.getAllByTestId("actual-block");
    expect(blocks).toHaveLength(2);
    expect(within(blocks[0]!).getByText("省略 11時間")).toBeInTheDocument();
    expect(
      within(blocks[1]!).getByText("前日から継続(省略)"),
    ).toBeInTheDocument();
    expect(heightPercentOf(blocks[1]!)).toBeCloseTo((24 / 1440) * 100);
    // 続きの印には超過の斜線を出さない
    await user.click(
      within(blocks[1]!).getByRole("button", { name: /の実績を編集/ }),
    );

    await screen.findByRole("dialog");
    expect(screen.getByLabelText("開始時刻")).toHaveValue("2026-07-07T20:00");
    expect(screen.getByLabelText("終了時刻")).toHaveValue("2026-07-08T07:00");
  });

  it("短い実績は週表示でも変わらない", () => {
    renderView("week", [{ ...LONG, endAt: iso(7) }]);

    expect(screen.queryByText(/省略/)).not.toBeInTheDocument();
  });
});
