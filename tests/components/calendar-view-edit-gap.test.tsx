import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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

// 仕様書: docs/specs/G-98_実績編集の予定との差分表示.md(カレンダーからの結線)。
// 週表示・日表示の実績ブロックから開いた編集パネルに、予定と同じ予定の実績合計が渡ることを確かめる

const iso = (hour: number, minute = 0) =>
  new Date(2026, 6, 7, hour, minute).toISOString();

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

describe("カレンダーの実績ブロックから開く編集パネル(G-98)", () => {
  it("紐づく予定の時刻と、同じ予定の実績をまとめたズレが出る", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <CalendarView
        events={[
          {
            id: "row-1",
            googleEventId: "g-1",
            title: "設計レビュー",
            startAt: iso(9),
            endAt: iso(10),
          },
        ]}
        timeEntries={[
          {
            id: "e1",
            title: "設計レビュー(前半)",
            googleEventId: "g-1",
            startAt: iso(9, 10),
            endAt: iso(9, 40),
          },
          {
            id: "e2",
            title: "設計レビュー(後半)",
            googleEventId: "g-1",
            startAt: iso(10),
            endAt: iso(10, 40),
          },
        ]}
        runningEntry={null}
        viewParam="day"
        dateParam="2026-07-07"
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: /^設計レビュー\(後半\)の実績を編集/,
      }),
    );

    const dialog = await screen.findByRole("dialog");
    const box = within(
      await within(dialog).findByRole("group", { name: "予定とのズレ" }),
    );
    expect(box.getByText("予定 09:00〜10:00(1時間)")).toBeInTheDocument();
    expect(box.getByText("開始 +10分 遅れ")).toBeInTheDocument();
    expect(box.getByText("所要 +10分 超過")).toBeInTheDocument();
    expect(box.getByText("同じ予定の実績 2件の合計")).toBeInTheDocument();
  });
});
