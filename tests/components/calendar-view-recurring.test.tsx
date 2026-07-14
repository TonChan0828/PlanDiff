import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { format, startOfDay } from "date-fns";

const {
  routerMock,
  startTimerActionMock,
  createAppEventActionMock,
  updateAppEventActionMock,
  deleteAppEventActionMock,
  createRecurringRuleActionMock,
  updateRecurringRuleActionMock,
  deleteRecurringRuleActionMock,
  deleteRecurringOccurrenceActionMock,
} = vi.hoisted(() => ({
  routerMock: { refresh: vi.fn(), push: vi.fn() },
  startTimerActionMock: vi.fn(),
  createAppEventActionMock: vi.fn(),
  updateAppEventActionMock: vi.fn(),
  deleteAppEventActionMock: vi.fn(),
  createRecurringRuleActionMock: vi.fn(),
  updateRecurringRuleActionMock: vi.fn(),
  deleteRecurringRuleActionMock: vi.fn(),
  deleteRecurringOccurrenceActionMock: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => routerMock }));
vi.mock("@/app/(app)/calendar/timer-actions", () => ({
  startTimerAction: startTimerActionMock,
  stopTimerAction: vi.fn(),
  updateTimeEntryAction: vi.fn(),
  deleteTimeEntryAction: vi.fn(),
}));
vi.mock("@/app/(app)/calendar/event-actions", () => ({
  createAppEventAction: createAppEventActionMock,
  updateAppEventAction: updateAppEventActionMock,
  deleteAppEventAction: deleteAppEventActionMock,
  createRecurringRuleAction: createRecurringRuleActionMock,
  updateRecurringRuleAction: updateRecurringRuleActionMock,
  deleteRecurringRuleAction: deleteRecurringRuleActionMock,
  deleteRecurringOccurrenceAction: deleteRecurringOccurrenceActionMock,
}));

import { CalendarView } from "@/components/calendar-view";
import { CALENDAR_MESSAGES as M } from "@/lib/calendar/messages";

// 仕様書: docs/specs/P5-1_定期予定.md S13〜S16

const today = startOfDay(new Date());
const todayParam = format(today, "yyyy-MM-dd");

function isoAt(hour: number, minute = 0): string {
  return new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
    hour,
    minute,
  ).toISOString();
}

const recurringEvent = {
  id: "row-rec-1",
  googleEventId: "rec:rule-123:2026-07-08",
  title: "朝会",
  startAt: isoAt(9, 0),
  endAt: isoAt(9, 30),
  source: "app" as const,
};

const appEvent = {
  id: "row-app-1",
  googleEventId: "app:uuid-1",
  title: "設計作業",
  startAt: isoAt(11, 0),
  endAt: isoAt(12, 0),
  source: "app" as const,
};

const ruleSummary = {
  id: "rule-123",
  title: "朝会",
  pattern: "weekly" as const,
  weekdays: [1, 3, 5],
  startTime: "09:00",
  endTime: "09:30",
  timezone: "Asia/Tokyo",
  startsOn: "2026-07-01",
  endsOn: null,
};

function renderView(overrides?: {
  events?: (typeof appEvent)[];
  recurringRules?: (typeof ruleSummary)[];
}) {
  return render(
    <CalendarView
      events={overrides?.events ?? [recurringEvent, appEvent]}
      timeEntries={[]}
      runningEntry={null}
      viewParam="day"
      dateParam={todayParam}
      googleConnected={false}
      googleEnabled={false}
      recurringRules={overrides?.recurringRules ?? [ruleSummary]}
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
  createAppEventActionMock.mockResolvedValue({ ok: true });
  updateAppEventActionMock.mockResolvedValue({ ok: true });
  deleteAppEventActionMock.mockResolvedValue({ ok: true });
  createRecurringRuleActionMock.mockResolvedValue({ ok: true });
  updateRecurringRuleActionMock.mockResolvedValue({ ok: true });
  deleteRecurringRuleActionMock.mockResolvedValue({ ok: true });
  deleteRecurringOccurrenceActionMock.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("繰り返し予定の作成(S13)", () => {
  it("S13: 「毎日」を選択して保存するとcreateRecurringRuleActionが呼ばれ、成功後パネルが閉じrefreshされる", async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(screen.getByRole("button", { name: M.eventAdd }));
    await user.type(screen.getByLabelText(M.eventTitleField), "夕会");
    // 作成パネルの初期時刻は「現在時刻の次の正時から1時間」で実行時刻に依存する
    // (22時台に実行すると23:00〜翌0:00になり、繰り返しの同日バリデーションで保存が
    // 弾かれてしまう)ため、同日内の時刻を明示して決定的にする
    fireEvent.change(screen.getByLabelText(M.eventStartField), {
      target: { value: format(today, "yyyy-MM-dd'T'10:00") },
    });
    fireEvent.change(screen.getByLabelText(M.eventEndField), {
      target: { value: format(today, "yyyy-MM-dd'T'11:00") },
    });
    await user.selectOptions(screen.getByLabelText(M.recurrenceField), "daily");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(createRecurringRuleActionMock).toHaveBeenCalledTimes(1);
    const input = createRecurringRuleActionMock.mock.calls[0]![0] as {
      pattern: string;
    };
    expect(input.pattern).toBe("daily");
    expect(createAppEventActionMock).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(routerMock.refresh).toHaveBeenCalled();
  });
});

describe("rec:予定の編集導線(S14/S15)", () => {
  it("S14: rec:予定の編集ボタンをタップすると「この予定のみ/繰り返し全体」の選択ステップが表示される", async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(
      screen.getByRole("button", { name: M.eventEditLabel("朝会") }),
    );

    expect(
      screen.getByText(M.recurringEditChoiceOccurrence),
    ).toBeInTheDocument();
    expect(screen.getByText(M.recurringEditChoiceSeries)).toBeInTheDocument();
  });

  it("S14: app:予定(非rec)の編集ボタンをタップすると従来どおり編集パネルが直接開く(選択ステップなし)", async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(
      screen.getByRole("button", { name: M.eventEditLabel("設計作業") }),
    );

    expect(
      screen.queryByText(M.recurringEditChoiceOccurrence),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText(M.eventTitleField)).toHaveValue("設計作業");
  });

  it("S15: 選択ステップで「繰り返し全体」を選ぶと、ルールの初期値付きで編集モードが開く", async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(
      screen.getByRole("button", { name: M.eventEditLabel("朝会") }),
    );
    await user.click(screen.getByText(M.recurringEditChoiceSeries));

    expect(screen.getByText(M.recurringEditWarning)).toBeInTheDocument();
    expect(screen.getByLabelText(M.eventTitleField)).toHaveValue("朝会");
  });

  it("選択ステップで「この予定のみ」を選ぶと単発編集モードが開き、削除でdeleteRecurringOccurrenceActionが呼ばれる", async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(
      screen.getByRole("button", { name: M.eventEditLabel("朝会") }),
    );
    await user.click(screen.getByText(M.recurringEditChoiceOccurrence));

    expect(screen.getByLabelText(M.eventTitleField)).toHaveValue("朝会");
    await user.click(screen.getByRole("button", { name: "削除" }));
    await user.click(
      screen.getByRole("button", { name: M.eventDeleteConfirmYes }),
    );

    expect(deleteRecurringOccurrenceActionMock).toHaveBeenCalledWith(
      "row-rec-1",
    );
    expect(deleteAppEventActionMock).not.toHaveBeenCalled();
  });
});

describe("rec:予定ブロックの表示とタイマー互換(S16)", () => {
  it("S16: rec:予定ブロックには繰り返しマークが表示され、タップでgoogleEventId付きのタイマー開始が呼ばれる", async () => {
    const user = userEvent.setup();
    renderView();

    expect(screen.getByTitle(M.recurringMarkLabel)).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "朝会のタイマーを開始" }),
    );

    expect(startTimerActionMock).toHaveBeenCalledWith({
      googleEventId: "rec:rule-123:2026-07-08",
      title: "朝会",
    });
  });

  it("S16: app:予定ブロックには繰り返しマークが表示されない(rec:予定の分のみ1件)", () => {
    renderView();

    expect(screen.getAllByTitle(M.recurringMarkLabel)).toHaveLength(1);
  });
});
