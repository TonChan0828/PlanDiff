import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { format, startOfDay, subHours } from "date-fns";

const { routerMock, startTimerActionMock, stopTimerActionMock } = vi.hoisted(
  () => ({
    routerMock: { refresh: vi.fn(), push: vi.fn() },
    startTimerActionMock: vi.fn(),
    stopTimerActionMock: vi.fn(),
  }),
);
vi.mock("next/navigation", () => ({ useRouter: () => routerMock }));
vi.mock("@/app/(app)/calendar/timer-actions", () => ({
  startTimerAction: startTimerActionMock,
  stopTimerAction: stopTimerActionMock,
}));

import { CalendarView } from "@/components/calendar-view";
import type { RunningEntry, TimeEntryItem } from "@/lib/timer/types";

// 仕様書: docs/specs/P2-2_予定連動タイマー.md S3〜S4 / S6〜S8
// (S5 タイマーバー単体は tests/components/running-timer-bar.test.tsx)

const START_ERROR = "タイマーを開始できませんでした";

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
  {
    id: "row-2",
    googleEventId: "g-2",
    title: "リリース作業",
    startAt: isoAt(14, 0),
    endAt: isoAt(15, 0),
  },
];

const confirmedEntry: TimeEntryItem = {
  id: "entry-1",
  title: "朝会",
  googleEventId: null,
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
      timeEntries={overrides?.timeEntries ?? []}
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
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("予定タップでタイマー開始(S3)", () => {
  it("S3: 実行中なしで予定をタップすると開始アクションが呼ばれ、即時に実行中表示になる", async () => {
    const user = userEvent.setup();
    let resolveStart: (value: { ok: boolean }) => void;
    startTimerActionMock.mockReturnValue(
      new Promise((resolve) => {
        resolveStart = resolve;
      }),
    );
    renderView();

    await user.click(
      screen.getByRole("button", { name: "設計レビューのタイマーを開始" }),
    );

    expect(startTimerActionMock).toHaveBeenCalledWith({
      googleEventId: "g-1",
      title: "設計レビュー",
    });
    // 楽観的更新: アクション完了前に実行中表示へ切り替わる
    expect(screen.getByText("記録中")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "設計レビューのタイマーを停止" }),
    ).toBeInTheDocument();

    resolveStart!({ ok: true });
    await vi.waitFor(() => {
      expect(routerMock.refresh).toHaveBeenCalled();
    });
  });

  it("S3: 別のタイマー実行中に他の予定をタップしてもエラーにならず開始される(自動停止はサーバー側)", async () => {
    const user = userEvent.setup();
    renderView({ runningEntry: runningForG1 });

    await user.click(
      screen.getByRole("button", { name: "リリース作業のタイマーを開始" }),
    );

    expect(startTimerActionMock).toHaveBeenCalledWith({
      googleEventId: "g-2",
      title: "リリース作業",
    });
    // 実行中表示は新しい予定へ移る
    expect(
      screen.getByRole("button", { name: "リリース作業のタイマーを停止" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "設計レビューのタイマーを開始" }),
    ).toBeInTheDocument();
  });
});

describe("予定タップでタイマー停止(S4)", () => {
  it("S4: 実行中の予定をもう一度タップすると停止アクションが呼ばれ、実行中表示が解除される", async () => {
    const user = userEvent.setup();
    renderView({ runningEntry: runningForG1 });

    // 実行中の予定は停止ボタンとして表示される
    const stopButton = screen.getByRole("button", {
      name: "設計レビューのタイマーを停止",
    });
    expect(screen.getAllByText("記録中").length).toBeGreaterThan(0);

    await user.click(stopButton);

    expect(stopTimerActionMock).toHaveBeenCalled();
    // 楽観的更新: 即時に開始可能な表示へ戻る
    expect(
      screen.getByRole("button", { name: "設計レビューのタイマーを開始" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("記録中")).not.toBeInTheDocument();
  });
});

describe("開始失敗時のロールバック(S6)", () => {
  it("S6: 開始アクションが失敗すると日本語エラーが表示され、UIが元に戻る", async () => {
    const user = userEvent.setup();
    startTimerActionMock.mockResolvedValue({ ok: false });
    renderView();

    await user.click(
      screen.getByRole("button", { name: "設計レビューのタイマーを開始" }),
    );

    expect(await screen.findByText(START_ERROR)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "設計レビューのタイマーを開始" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("記録中")).not.toBeInTheDocument();
  });
});

describe("実績ブロックの表示(S7)", () => {
  it("S7: 確定済み実績と実行中エントリが右レーンに表示される", async () => {
    renderView({
      timeEntries: [confirmedEntry],
      runningEntry: runningForG1,
    });

    const blocks = await screen.findAllByTestId("actual-block");
    // 確定済み(朝会)+実行中(設計レビュー: start〜現在)
    expect(blocks).toHaveLength(2);
    expect(screen.getByText("朝会")).toBeInTheDocument();
  });
});

describe("タイマーバーの表示条件(S8)", () => {
  it("S8: 実行中エントリがあるときはタイマーバーが表示される", () => {
    renderView({ runningEntry: runningForG1 });
    expect(screen.getByTestId("running-timer-bar")).toBeInTheDocument();
  });

  it("S8: 実行中エントリがないときはタイマーバーが表示されない", () => {
    renderView();
    expect(screen.queryByTestId("running-timer-bar")).not.toBeInTheDocument();
  });
});

// 仕様書: docs/specs/P2-3_フリータイマー.md S5〜S8
describe("フリータイマーの開始(S5〜S7)", () => {
  it("S5: 実行中なしでタイトルを入力して開始すると、googleEventId:nullで開始アクションが呼ばれ実行中表示になる", async () => {
    const user = userEvent.setup();
    let resolveStart: (value: { ok: boolean }) => void;
    startTimerActionMock.mockReturnValue(
      new Promise((resolve) => {
        resolveStart = resolve;
      }),
    );
    renderView();

    expect(screen.getByTestId("free-timer-bar")).toBeInTheDocument();
    await user.type(
      screen.getByRole("textbox", { name: "作業内容(空欄可)" }),
      "読書",
    );
    await user.click(
      screen.getByRole("button", { name: "フリータイマーを開始" }),
    );

    expect(startTimerActionMock).toHaveBeenCalledWith({
      googleEventId: null,
      title: "読書",
    });
    expect(screen.getByTestId("running-timer-bar")).toBeInTheDocument();
    expect(screen.queryByTestId("free-timer-bar")).not.toBeInTheDocument();

    resolveStart!({ ok: true });
    await vi.waitFor(() => {
      expect(routerMock.refresh).toHaveBeenCalled();
    });
  });

  it("S6: タイトル未入力で開始すると、空文字で開始アクションが呼ばれ「(タイトルなし)」と表示される", async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(
      screen.getByRole("button", { name: "フリータイマーを開始" }),
    );

    expect(startTimerActionMock).toHaveBeenCalledWith({
      googleEventId: null,
      title: "",
    });
    const { getByText } = within(screen.getByTestId("running-timer-bar"));
    expect(getByText("(タイトルなし)")).toBeInTheDocument();
  });

  it("S7: 開始アクションが失敗すると日本語エラーが表示され、フリータイマー入力に戻る", async () => {
    const user = userEvent.setup();
    startTimerActionMock.mockResolvedValue({ ok: false });
    renderView();

    await user.type(
      screen.getByRole("textbox", { name: "作業内容(空欄可)" }),
      "読書",
    );
    await user.click(
      screen.getByRole("button", { name: "フリータイマーを開始" }),
    );

    expect(await screen.findByText(START_ERROR)).toBeInTheDocument();
    expect(screen.getByTestId("free-timer-bar")).toBeInTheDocument();
    expect(screen.queryByTestId("running-timer-bar")).not.toBeInTheDocument();
  });
});

describe("フリータイマー実行中の表示(S8)", () => {
  it("S8: フリータイマー実行中はRunningTimerBarが表示され、FreeTimerBarは表示されない", () => {
    renderView({
      runningEntry: {
        id: "entry-free",
        title: "読書",
        googleEventId: null,
        startAt: subHours(new Date(), 1).toISOString(),
      },
    });

    expect(screen.getByTestId("running-timer-bar")).toBeInTheDocument();
    expect(screen.queryByTestId("free-timer-bar")).not.toBeInTheDocument();
  });
});
