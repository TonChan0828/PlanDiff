import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { format, isSameDay, startOfDay } from "date-fns";

const {
  routerMock,
  startTimerActionMock,
  stopTimerActionMock,
  updateTimeEntryActionMock,
  deleteTimeEntryActionMock,
  updateAppEventActionMock,
  deleteAppEventActionMock,
} = vi.hoisted(() => ({
  routerMock: { refresh: vi.fn(), push: vi.fn() },
  startTimerActionMock: vi.fn(),
  stopTimerActionMock: vi.fn(),
  updateTimeEntryActionMock: vi.fn(),
  deleteTimeEntryActionMock: vi.fn(),
  updateAppEventActionMock: vi.fn(),
  deleteAppEventActionMock: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => routerMock }));
vi.mock("@/app/(app)/calendar/timer-actions", () => ({
  startTimerAction: startTimerActionMock,
  stopTimerAction: stopTimerActionMock,
  updateTimeEntryAction: updateTimeEntryActionMock,
  deleteTimeEntryAction: deleteTimeEntryActionMock,
}));
vi.mock("@/app/(app)/calendar/event-actions", () => ({
  createAppEventAction: vi.fn(),
  updateAppEventAction: updateAppEventActionMock,
  deleteAppEventAction: deleteAppEventActionMock,
}));

import { CalendarView } from "@/components/calendar-view";
import type { CalendarViewEvent } from "@/components/calendar-view";
import { CALENDAR_MESSAGES as M } from "@/lib/calendar/messages";
import { jaMinimal as ja } from "@/lib/ui/ja-locale";
import { toDateParam, weekDaysOf } from "@/lib/calendar/view-date";
import type { TimeEntryItem } from "@/lib/timer/types";

// 仕様書: docs/specs/P11-1_週表示の日付選択と編集導線.md S1〜S6・S8

const today = startOfDay(new Date());
const todayParam = toDateParam(today);
const otherDay = weekDaysOf(today).find((day) => !isSameDay(day, today))!;
const otherDayParam = toDateParam(otherDay);

function isoAt(day: Date, hour: number, minute = 0): string {
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    hour,
    minute,
  ).toISOString();
}

function dayHeaderLabel(day: Date): string {
  return format(day, "M月d日(E)", { locale: ja });
}

const appEventOnOtherDay: CalendarViewEvent = {
  id: "row-app-2",
  googleEventId: "app:uuid-2",
  title: "他日作業",
  startAt: isoAt(otherDay, 9, 0),
  endAt: isoAt(otherDay, 10, 0),
  source: "app",
};

const entryOnOtherDay: TimeEntryItem = {
  id: "entry-other",
  title: "他日実績",
  googleEventId: null,
  startAt: isoAt(otherDay, 8, 0),
  endAt: isoAt(otherDay, 8, 30),
};

function renderView(overrides?: {
  dateParam?: string;
  events?: CalendarViewEvent[];
  timeEntries?: TimeEntryItem[];
}) {
  return render(
    <CalendarView
      events={overrides?.events ?? [appEventOnOtherDay]}
      timeEntries={overrides?.timeEntries ?? [entryOnOtherDay]}
      runningEntry={null}
      viewParam="week"
      dateParam={overrides?.dateParam ?? todayParam}
      googleConnected={false}
      googleEnabled={false}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ events: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
  startTimerActionMock.mockResolvedValue({ ok: true });
  stopTimerActionMock.mockResolvedValue({ ok: true });
  updateTimeEntryActionMock.mockResolvedValue({ ok: true });
  updateAppEventActionMock.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("週表示の日ヘッダー選択(S1/S2)", () => {
  it("S1: 今日以外の日ヘッダーをクリックすると、その日をdateパラメータに持つURLへ遷移する", async () => {
    const user = userEvent.setup();
    renderView({ dateParam: todayParam });

    await user.click(
      screen.getByRole("button", { name: dayHeaderLabel(otherDay) }),
    );

    expect(routerMock.push).toHaveBeenCalledWith(
      `/calendar?view=week&date=${otherDayParam}`,
    );
  });

  it("S2: 他の日を選択中に今日の日ヘッダーをクリックすると、dateパラメータなしのURLへ遷移する", async () => {
    const user = userEvent.setup();
    renderView({ dateParam: otherDayParam });

    await user.click(
      screen.getByRole("button", { name: dayHeaderLabel(today) }),
    );

    expect(routerMock.push).toHaveBeenCalledWith("/calendar?view=week");
  });
});

describe("週表示の日ヘッダーの選択状態(S3/S4)", () => {
  it("S3: 今日以外の日を選択中は、その日にaria-pressed、今日の列にaria-currentが付く", () => {
    renderView({ dateParam: otherDayParam });

    const otherDayButton = screen.getByRole("button", {
      name: dayHeaderLabel(otherDay),
    });
    const todayButton = screen.getByRole("button", {
      name: dayHeaderLabel(today),
    });

    expect(otherDayButton).toHaveAttribute("aria-pressed", "true");
    expect(otherDayButton).not.toHaveAttribute("aria-current");
    expect(todayButton).toHaveAttribute("aria-current", "date");
    expect(todayButton).toHaveAttribute("aria-pressed", "false");
  });

  it("S4: 今日を選択中は、今日の列にaria-pressedとaria-currentの両方が付く", () => {
    renderView({ dateParam: todayParam });

    const todayButton = screen.getByRole("button", {
      name: dayHeaderLabel(today),
    });

    expect(todayButton).toHaveAttribute("aria-pressed", "true");
    expect(todayButton).toHaveAttribute("aria-current", "date");
  });
});

describe("週表示での他日の予定・実績編集(S5/S6)", () => {
  it("S5: 今日以外の日を表示中、その日のアプリ内予定をコンテキストパネルから編集できる", async () => {
    const user = userEvent.setup();
    renderView({ dateParam: otherDayParam });

    await user.click(screen.getByRole("button", { name: M.contextOpen }));
    await user.click(
      screen.getByRole("button", { name: M.eventEditLabel("他日作業") }),
    );

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(M.eventTitleField)).toHaveValue("他日作業");
  });

  it("S6: 今日以外の日を表示中、その日の確定済み実績をコンテキストパネルから編集できる", async () => {
    const user = userEvent.setup();
    renderView({ dateParam: otherDayParam });

    await user.click(screen.getByRole("button", { name: M.contextOpen }));
    await user.click(
      screen.getByRole("button", { name: "他日実績の実績を編集" }),
    );

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("タイトル")).toHaveValue("他日実績");
  });
});
