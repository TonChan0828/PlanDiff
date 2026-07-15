import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { format, startOfDay } from "date-fns";

const {
  routerMock,
  startTimerActionMock,
  stopTimerActionMock,
  updateTimeEntryActionMock,
  deleteTimeEntryActionMock,
  createAppEventActionMock,
  updateAppEventActionMock,
  deleteAppEventActionMock,
} = vi.hoisted(() => ({
  routerMock: { refresh: vi.fn(), push: vi.fn() },
  startTimerActionMock: vi.fn(),
  stopTimerActionMock: vi.fn(),
  updateTimeEntryActionMock: vi.fn(),
  deleteTimeEntryActionMock: vi.fn(),
  createAppEventActionMock: vi.fn(),
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
  createAppEventAction: createAppEventActionMock,
  updateAppEventAction: updateAppEventActionMock,
  deleteAppEventAction: deleteAppEventActionMock,
}));

import { CalendarView } from "@/components/calendar-view";
import { CALENDAR_MESSAGES as M } from "@/lib/calendar/messages";

// 仕様書: docs/specs/P2-5_アプリ内予定とGoogle連携凍結.md S1 / S4 / S5 / S7 / S8 / S18 / S19

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

const appEvent = {
  id: "row-app-1",
  googleEventId: "app:uuid-1",
  title: "設計作業",
  startAt: isoAt(9, 0),
  endAt: isoAt(10, 0),
  source: "app" as const,
};

const googleEvent = {
  id: "row-g-1",
  googleEventId: "g-1",
  title: "定例会議",
  startAt: isoAt(13, 0),
  endAt: isoAt(14, 0),
  source: "google" as const,
};

function renderView(overrides?: {
  events?: (typeof appEvent)[];
  googleEnabled?: boolean;
}) {
  return render(
    <CalendarView
      events={overrides?.events ?? [appEvent, googleEvent]}
      timeEntries={[]}
      runningEntry={null}
      viewParam="day"
      dateParam={todayParam}
      googleConnected={false}
      googleEnabled={overrides?.googleEnabled}
    />,
  );
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ events: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  startTimerActionMock.mockResolvedValue({ ok: true });
  createAppEventActionMock.mockResolvedValue({ ok: true });
  updateAppEventActionMock.mockResolvedValue({ ok: true });
  deleteAppEventActionMock.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("予定の作成(S1)", () => {
  it("S1: 「予定を追加」からパネルを開いて保存すると、UTC ISOでアクションが呼ばれ、パネルが閉じて refresh される", async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(screen.getByRole("button", { name: M.eventAdd }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();

    await user.type(screen.getByLabelText(M.eventTitleField), "レビュー対応");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(createAppEventActionMock).toHaveBeenCalledTimes(1);
    const input = createAppEventActionMock.mock.calls[0]![0] as {
      title: string;
      startAt: string;
      endAt: string;
    };
    expect(input.title).toBe("レビュー対応");
    // UTCのISO文字列で、終了 > 開始
    expect(new Date(input.startAt).toISOString()).toBe(input.startAt);
    expect(new Date(input.endAt).toISOString()).toBe(input.endAt);
    expect(new Date(input.endAt).getTime()).toBeGreaterThan(
      new Date(input.startAt).getTime(),
    );

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(routerMock.refresh).toHaveBeenCalled();
  });
});

describe("アプリ予定の編集導線(S4/S5)", () => {
  it("S4: source='app' の予定ブロックには編集ボタンがあり、タップで初期値付きの編集パネルが開く", async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(screen.getByRole("button", { name: M.contextOpen }));
    await user.click(
      screen.getByRole("button", { name: M.eventEditLabel("設計作業") }),
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(M.eventTitleField)).toHaveValue("設計作業");
  });

  it("S5: source='google' の予定ブロックには編集ボタンが表示されない(タイマー操作は従来どおり)", async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(screen.getByRole("button", { name: M.contextOpen }));
    expect(
      screen.queryByRole("button", { name: M.eventEditLabel("定例会議") }),
    ).not.toBeInTheDocument();

    // Google予定のタップは従来どおりタイマー開始
    await user.click(
      screen.getByRole("button", { name: "定例会議のタイマーを開始" }),
    );
    expect(startTimerActionMock).toHaveBeenCalledWith({
      googleEventId: "g-1",
      title: "定例会議",
    });
  });
});

describe("アプリ予定とタイマーの互換(S7)", () => {
  it("S7: アプリ予定ブロックのタップで googleEventId='app:...' のままタイマーが開始される", async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(
      screen.getByRole("button", { name: "設計作業のタイマーを開始" }),
    );

    expect(startTimerActionMock).toHaveBeenCalledWith({
      googleEventId: "app:uuid-1",
      title: "設計作業",
    });
  });
});

describe("空状態の誘導(S8)", () => {
  it("S8: 予定・実績ゼロのとき、空メッセージに「予定を追加」への誘導文言が表示される", () => {
    renderView({ events: [] });

    expect(screen.getByText(M.empty)).toBeInTheDocument();
    expect(screen.getByText(M.emptyAddHint)).toBeInTheDocument();
  });
});

describe("Google凍結フラグ(S18/S19)", () => {
  it("S18: googleEnabled=false では同期fetchが発火せず、「更新」ボタンとバナーが表示されない", async () => {
    renderView({ googleEnabled: false });

    expect(
      screen.queryByRole("button", { name: M.refresh }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(M.googleNotConnectedBanner),
    ).not.toBeInTheDocument();
    // 同期fetchが発火しない(マウント後も呼ばれない)
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchMock).not.toHaveBeenCalled();
    // 予定ブロック・追加ボタンは動作する
    expect(
      screen.getByRole("button", { name: M.eventAdd }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "設計作業のタイマーを開始" }),
    ).toBeInTheDocument();
  });

  it("S19: googleEnabled=true(既定)では従来どおり同期fetchが発火し「更新」ボタンが表示される", async () => {
    renderView({ googleEnabled: true });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(
      screen.getByRole("button", { name: /更新|同期中/ }),
    ).toBeInTheDocument();
  });
});
