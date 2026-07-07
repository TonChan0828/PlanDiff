import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { format, startOfDay, subHours } from "date-fns";

const {
  routerMock,
  startTimerActionMock,
  stopTimerActionMock,
  updateTimeEntryActionMock,
  deleteTimeEntryActionMock,
} = vi.hoisted(() => ({
  routerMock: { refresh: vi.fn(), push: vi.fn() },
  startTimerActionMock: vi.fn(),
  stopTimerActionMock: vi.fn(),
  updateTimeEntryActionMock: vi.fn(),
  deleteTimeEntryActionMock: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => routerMock }));
vi.mock("@/app/(app)/calendar/timer-actions", () => ({
  startTimerAction: startTimerActionMock,
  stopTimerAction: stopTimerActionMock,
  updateTimeEntryAction: updateTimeEntryActionMock,
  deleteTimeEntryAction: deleteTimeEntryActionMock,
}));

import { CalendarView } from "@/components/calendar-view";
import type { RunningEntry, TimeEntryItem } from "@/lib/timer/types";

// 仕様書: docs/specs/P2-4_実績の手動編集.md S10〜S15

const UPDATE_ERROR = "実績を更新できませんでした";
const DELETE_ERROR = "実績を削除できませんでした";

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

const planEvents = [
  {
    id: "row-1",
    googleEventId: "g-1",
    title: "設計レビュー",
    startAt: isoAt(9, 0),
    endAt: isoAt(10, 30),
  },
];

const confirmedEntry: TimeEntryItem = {
  id: "entry-1",
  title: "朝会",
  startAt: isoAt(8, 0),
  endAt: isoAt(8, 30),
};

const runningForG1: RunningEntry = {
  id: "entry-run",
  title: "設計レビュー",
  googleEventId: "g-1",
  startAt: subHours(new Date(), 1).toISOString(),
};

function renderView(overrides?: {
  runningEntry?: RunningEntry | null;
  timeEntries?: TimeEntryItem[];
}) {
  return render(
    <CalendarView
      events={planEvents}
      timeEntries={overrides?.timeEntries ?? [confirmedEntry]}
      runningEntry={overrides?.runningEntry ?? null}
      viewParam="day"
      dateParam={todayParam}
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
  deleteTimeEntryActionMock.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("実績ブロックタップで編集パネルを開く(S10/S11)", () => {
  it("S10: 確定済み実績ブロックをタップすると編集パネルが開き、内容が渡される", async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(screen.getByRole("button", { name: "朝会の実績を編集" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("タイトル")).toHaveValue("朝会");
  });

  it("S11: 実行中の実績ブロックは編集できない(編集ボタンが存在しない)", () => {
    renderView({ runningEntry: runningForG1 });

    expect(
      screen.queryByRole("button", { name: "設計レビューの実績を編集" }),
    ).not.toBeInTheDocument();
  });
});

describe("編集パネルの保存(S12/S13)", () => {
  it("S12: 保存が成功するとパネルが閉じてrouter.refreshが呼ばれる", async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(screen.getByRole("button", { name: "朝会の実績を編集" }));
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(updateTimeEntryActionMock).toHaveBeenCalledWith("entry-1", {
      title: "朝会",
      startAt: confirmedEntry.startAt,
      endAt: confirmedEntry.endAt,
    });
    await vi.waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(routerMock.refresh).toHaveBeenCalled();
  });

  it("S13: 保存が失敗するとパネルが開いたままエラーが表示される", async () => {
    const user = userEvent.setup();
    updateTimeEntryActionMock.mockResolvedValue({ ok: false });
    renderView();

    await user.click(screen.getByRole("button", { name: "朝会の実績を編集" }));
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText(UPDATE_ERROR)).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("編集パネルの削除(S14/S15)", () => {
  it("S14: 削除が成功するとパネルが閉じてrouter.refreshが呼ばれる", async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(screen.getByRole("button", { name: "朝会の実績を編集" }));
    await user.click(screen.getByRole("button", { name: "削除" }));
    await user.click(screen.getByRole("button", { name: "削除する" }));

    expect(deleteTimeEntryActionMock).toHaveBeenCalledWith("entry-1");
    await vi.waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(routerMock.refresh).toHaveBeenCalled();
  });

  it("S15: 削除が失敗すると確認表示のままエラーが表示される", async () => {
    const user = userEvent.setup();
    deleteTimeEntryActionMock.mockResolvedValue({ ok: false });
    renderView();

    await user.click(screen.getByRole("button", { name: "朝会の実績を編集" }));
    await user.click(screen.getByRole("button", { name: "削除" }));
    await user.click(screen.getByRole("button", { name: "削除する" }));

    expect(await screen.findByText(DELETE_ERROR)).toBeInTheDocument();
    expect(screen.getByText("この実績を削除しますか?")).toBeInTheDocument();
  });
});
