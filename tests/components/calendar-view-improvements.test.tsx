import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { router, clock } = vi.hoisted(() => ({
  router: { push: vi.fn(), refresh: vi.fn() },
  clock: { now: new Date(2026, 8, 30, 12, 0).getTime() },
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/time/use-now-minute", () => ({
  useNowMinuteMs: () => clock.now,
}));
vi.mock("@/lib/calendar/layout", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/calendar/layout")>();
  return { ...actual, layoutDayEvents: vi.fn(actual.layoutDayEvents) };
});
vi.mock("@/app/(app)/calendar/timer-actions", () => ({
  startTimerAction: vi.fn(),
  stopTimerAction: vi.fn(),
  updateTimeEntryAction: vi.fn(),
  deleteTimeEntryAction: vi.fn(),
  updateRunningStartAction: vi.fn(),
}));
vi.mock("@/app/(app)/calendar/event-actions", () => ({
  createAppEventAction: vi.fn(),
  updateAppEventAction: vi.fn(),
  deleteAppEventAction: vi.fn(),
  createRecurringRuleAction: vi.fn(),
  updateRecurringRuleAction: vi.fn(),
  deleteRecurringRuleAction: vi.fn(),
  deleteRecurringOccurrenceAction: vi.fn(),
  disableRuleLearningAction: vi.fn(),
}));

import {
  CalendarView,
  type CalendarViewEvent,
} from "@/components/calendar-view";
import { layoutDayEvents } from "@/lib/calendar/layout";
import { CALENDAR_MESSAGES as M } from "@/lib/calendar/messages";
import { TIMER_MESSAGES as T } from "@/lib/timer/messages";
import { mockDesktopMatchMedia } from "../helpers/match-media";

// 仕様書: P16-ui S1/S2/S8〜S11。時計はローカル正午に固定する(R-1)。
const events: CalendarViewEvent[] = [
  {
    id: "overnight",
    googleEventId: "app:overnight",
    source: "app",
    title: "夜の設計",
    startAt: new Date(2026, 8, 29, 23).toISOString(),
    endAt: new Date(2026, 8, 30, 1).toISOString(),
  },
  {
    id: "recurring",
    googleEventId: "rec:rule:2026-09-30",
    source: "app",
    title: "定例",
    startAt: new Date(2026, 8, 30, 9).toISOString(),
    endAt: new Date(2026, 8, 30, 10).toISOString(),
  },
];
const entries = [
  {
    id: "actual",
    googleEventId: null,
    title: "実績",
    startAt: new Date(2026, 8, 30, 10).toISOString(),
    endAt: new Date(2026, 8, 30, 11).toISOString(),
  },
];
const baseProps = {
  events,
  timeEntries: entries,
  runningEntry: null,
  googleEnabled: false,
  dateParam: "2026-09-30",
  viewParam: "day",
};

beforeEach(() => {
  vi.clearAllMocks();
  clock.now = new Date(2026, 8, 30, 12).getTime();
  mockDesktopMatchMedia(false);
});

describe("P16-ui 編集シート", () => {
  it.each([
    ["予定", M.eventEditLabel("定例"), M.recurringEditChoiceTitle],
    ["実績", "実績の実績を編集", T.editTitle],
  ])(
    "S1: モバイルで%sを編集すると一覧シートが閉じる",
    async (_, editLabel, dialogLabel) => {
      const user = userEvent.setup();
      render(<CalendarView {...baseProps} />);
      await user.click(screen.getByRole("button", { name: M.contextOpen }));
      await user.click(screen.getByRole("button", { name: editLabel }));
      expect(
        await screen.findByRole("dialog", { name: dialogLabel }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("complementary", { name: M.contextHeading }),
      ).not.toBeInTheDocument();
    },
  );

  it("S8/S1: 日またぎ予定を翌日の一覧から編集し、元の日時を入力欄に渡す", async () => {
    const user = userEvent.setup();
    render(<CalendarView {...baseProps} />);
    await user.click(screen.getByRole("button", { name: M.contextOpen }));
    await user.click(
      screen.getByRole("button", { name: M.eventEditLabel("夜の設計") }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: M.eventEditTitle,
    });
    expect(
      screen.queryByRole("complementary", { name: M.contextHeading }),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText(M.eventStartField)).toHaveValue(
      "2026-09-29T23:00",
    );
    expect(within(dialog).getByLabelText(M.eventEndField)).toHaveValue(
      "2026-09-30T01:00",
    );
  });

  it("S2: デスクトップの常設一覧は編集開始後も表示する", async () => {
    mockDesktopMatchMedia(true);
    const user = userEvent.setup();
    render(<CalendarView {...baseProps} />);
    await user.click(
      screen.getByRole("button", { name: M.eventEditLabel("定例") }),
    );
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("complementary", { name: M.contextHeading }),
    ).toBeInTheDocument();
  });
});

describe("P16-ui 日付参照とレイアウト", () => {
  it.each(["day", "week"])(
    "S9: %s表示の一覧開閉でレイアウトを再計算しない",
    async (viewParam) => {
      const user = userEvent.setup();
      render(<CalendarView {...baseProps} viewParam={viewParam} />);
      const before = vi.mocked(layoutDayEvents).mock.calls.length;
      await user.click(screen.getByRole("button", { name: M.contextOpen }));
      const panel = screen.getByRole("complementary", {
        name: M.contextHeading,
      });
      await user.click(
        within(panel).getByRole("button", { name: M.contextClose }),
      );
      expect(layoutDayEvents).toHaveBeenCalledTimes(before);
    },
  );

  it("S10: 表示日と予定データの変更は再計算して表示へ反映する", () => {
    const { rerender } = render(<CalendarView {...baseProps} />);
    const before = vi.mocked(layoutDayEvents).mock.calls.length;
    rerender(<CalendarView {...baseProps} dateParam="2026-10-01" />);
    expect(vi.mocked(layoutDayEvents).mock.calls.length).toBeGreaterThan(
      before,
    );
    expect(
      screen.queryByRole("button", { name: T.startLabel("定例") }),
    ).not.toBeInTheDocument();
    const changedEvents = [
      {
        ...events[1]!,
        title: "翌日作業",
        startAt: new Date(2026, 9, 1, 9).toISOString(),
        endAt: new Date(2026, 9, 1, 10).toISOString(),
      },
    ];
    rerender(
      <CalendarView
        {...baseProps}
        dateParam="2026-10-01"
        events={changedEvents}
      />,
    );
    expect(
      screen.getByRole("button", { name: T.startLabel("翌日作業") }),
    ).toBeInTheDocument();
  });

  it("S11: 分更新では予定レイアウトを維持し、日付またぎでは更新する", () => {
    const { rerender } = render(
      <CalendarView {...baseProps} dateParam={undefined} />,
    );
    const planCalls = () =>
      vi
        .mocked(layoutDayEvents)
        .mock.calls.filter(([input]) => input === events).length;
    const before = planCalls();
    clock.now = new Date(2026, 8, 30, 12, 1).getTime();
    rerender(<CalendarView {...baseProps} dateParam={undefined} />);
    expect(planCalls()).toBe(before);
    clock.now = new Date(2026, 9, 1, 0, 0).getTime();
    rerender(<CalendarView {...baseProps} dateParam={undefined} />);
    expect(planCalls()).toBeGreaterThan(before);
    expect(
      screen.queryByRole("button", { name: T.startLabel("定例") }),
    ).not.toBeInTheDocument();
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });
});
