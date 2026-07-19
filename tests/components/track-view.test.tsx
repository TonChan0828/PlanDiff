import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addHours, subHours, subMinutes } from "date-fns";

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

import { TrackView } from "@/components/track-view";
import type { RunningEntry, TimeEntryItem } from "@/lib/timer/types";
import type { QuickStartEvent } from "@/lib/track/quick-start";

// 仕様書: docs/specs/P2-6_計測画面.md S5〜S9
// (S12 昇格→DB作成は tests/integration/track.test.ts)

const START_ERROR = "タイマーを開始できませんでした";
const EMPTY_TODAY = "今日の実績はまだありません";

// 基準時刻は「今日の正午」に固定する。実時刻のままだとUTCのCIが早朝に走った際、
// subHoursで作る実績が前日に食い込み「今日の実績」から外れて落ちる(時刻依存フレーク)
const now = new Date();
now.setHours(12, 0, 0, 0);

function quickEvent(
  id: string,
  title: string,
  startAt: Date,
  endAt: Date,
): QuickStartEvent {
  return {
    id,
    googleEventId: `g-${id}`,
    title,
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
  };
}

const freeEntry: TimeEntryItem = {
  id: "entry-free",
  title: "リファクタリング",
  googleEventId: null,
  startAt: subHours(now, 3).toISOString(),
  endAt: subHours(now, 2).toISOString(),
};

const linkedEntry: TimeEntryItem = {
  id: "entry-linked",
  title: "設計レビュー",
  googleEventId: "g-review",
  startAt: subHours(now, 2).toISOString(),
  endAt: subHours(now, 1).toISOString(),
};

const runningEntry: RunningEntry = {
  id: "entry-run",
  title: "実装作業",
  googleEventId: null,
  startAt: subMinutes(now, 10).toISOString(),
};

function renderView(overrides?: {
  events?: QuickStartEvent[];
  timeEntries?: TimeEntryItem[];
  runningEntry?: RunningEntry | null;
}) {
  return render(
    <TrackView
      events={overrides?.events ?? []}
      timeEntries={overrides?.timeEntries ?? []}
      runningEntry={overrides?.runningEntry ?? null}
    />,
  );
}

beforeEach(() => {
  // コンポーネント内のnew Date()も正午基準に揃える。shouldAdvanceTimeで実時間に
  // 追従させ、userEventの内部タイマーが止まらないようにする
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(now);
  vi.clearAllMocks();
  startTimerActionMock.mockResolvedValue({ ok: true });
  stopTimerActionMock.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("タイマー操作エリア(S5/S6)", () => {
  it("S5: 実行中なしのときフリータイマーフォームが表示され、開始でstartTimerActionが呼ばれる", async () => {
    const user = userEvent.setup();
    renderView();

    await user.type(
      screen.getByRole("textbox", { name: "作業内容(空欄可)" }),
      "調査",
    );
    await user.click(
      screen.getByRole("button", { name: "フリータイマーを開始" }),
    );

    expect(startTimerActionMock).toHaveBeenCalledWith({
      googleEventId: null,
      title: "調査",
    });
  });

  it("S6: 実行中ありのときタイトル・経過時間・停止ボタンが表示され、停止でstopTimerActionが呼ばれる", async () => {
    const user = userEvent.setup();
    renderView({ runningEntry });

    expect(screen.getByText("実装作業")).toBeInTheDocument();
    expect(screen.getByLabelText("経過時間")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "停止" }));

    expect(stopTimerActionMock).toHaveBeenCalled();
  });
});

describe("今の予定から開始(S1連動UI)", () => {
  it("進行中・直近の予定がボタンとして表示され、タップで予定連動タイマーが開始される", async () => {
    const user = userEvent.setup();
    renderView({
      events: [
        quickEvent(
          "ongoing",
          "設計レビュー",
          subHours(now, 1),
          addHours(now, 1),
        ),
      ],
    });

    await user.click(
      screen.getByRole("button", { name: "設計レビューのタイマーを開始" }),
    );

    expect(startTimerActionMock).toHaveBeenCalledWith({
      googleEventId: "g-ongoing",
      title: "設計レビュー",
    });
  });

  it("該当予定がないときはセクションごと表示されない", () => {
    renderView({ events: [] });

    expect(screen.queryByText("今の予定から開始")).not.toBeInTheDocument();
  });
});

describe("今日の実績リスト(S7/S8)", () => {
  it("S7: 「予定にする」ボタンはフリー実績の行にのみ表示される", () => {
    renderView({ timeEntries: [freeEntry, linkedEntry] });

    const list = screen.getByRole("list", { name: "今日の実績" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);

    expect(
      screen.getByRole("button", { name: "リファクタリングを予定にする" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "設計レビューを予定にする" }),
    ).not.toBeInTheDocument();
  });

  it("S8: 今日の実績がゼロ件のとき空状態メッセージが表示される", () => {
    renderView({ timeEntries: [] });

    expect(screen.getByText(EMPTY_TODAY)).toBeInTheDocument();
  });

  it("S7補: 「予定にする」をタップすると翌日同時刻を初期値にした予定作成ダイアログが開く", async () => {
    const user = userEvent.setup();
    renderView({ timeEntries: [freeEntry] });

    await user.click(
      screen.getByRole("button", { name: "リファクタリングを予定にする" }),
    );

    const dialog = screen.getByRole("dialog", { name: "予定を追加" });
    expect(
      within(dialog).getByRole("textbox", { name: "タイトル" }),
    ).toHaveValue("リファクタリング");
  });
});

// 仕様書: docs/specs/P5-4_実績からの再計測.md S1/S2/S9/S10
describe("今日の実績からの再計測(P5-4 S1/S2/S9/S10)", () => {
  it("S1: 予定紐づき実績の再計測ボタンでgoogleEventId・titleを引き継いで開始され、実行中表示になる", async () => {
    const user = userEvent.setup();
    renderView({ timeEntries: [linkedEntry] });

    await user.click(
      screen.getByRole("button", { name: "設計レビューを再計測" }),
    );

    expect(startTimerActionMock).toHaveBeenCalledWith({
      googleEventId: "g-review",
      title: "設計レビュー",
    });
    expect(screen.getByRole("button", { name: "停止" })).toBeInTheDocument();
  });

  it("S2: フリー実績の再計測はgoogleEventId:nullで開始され、「予定にする」ボタンも残る", async () => {
    const user = userEvent.setup();
    renderView({ timeEntries: [freeEntry] });

    await user.click(
      screen.getByRole("button", { name: "リファクタリングを再計測" }),
    );

    expect(startTimerActionMock).toHaveBeenCalledWith({
      googleEventId: null,
      title: "リファクタリング",
    });
    expect(
      screen.getByRole("button", { name: "リファクタリングを予定にする" }),
    ).toBeInTheDocument();
  });

  it("S9: タイトルが空の実績は無題表記の再計測ボタンになり、空タイトルのまま開始される", async () => {
    const user = userEvent.setup();
    const untitledEntry: TimeEntryItem = {
      id: "entry-untitled",
      title: "",
      googleEventId: null,
      startAt: subHours(now, 5).toISOString(),
      endAt: subHours(now, 4).toISOString(),
    };
    renderView({ timeEntries: [untitledEntry] });

    await user.click(
      screen.getByRole("button", { name: "(タイトルなし)を再計測" }),
    );

    expect(startTimerActionMock).toHaveBeenCalledWith({
      googleEventId: null,
      title: "",
    });
  });

  it("S10: pending中に再計測ボタンを連打しても開始処理は1回しか呼ばれない", async () => {
    const user = userEvent.setup();
    startTimerActionMock.mockReturnValue(new Promise(() => {}));
    renderView({ timeEntries: [linkedEntry] });

    const button = screen.getByRole("button", {
      name: "設計レビューを再計測",
    });
    await user.click(button);
    await user.click(button);

    expect(startTimerActionMock).toHaveBeenCalledTimes(1);
  });
});

describe("エラー表示(S9)", () => {
  it("S9: タイマー開始が失敗すると日本語のエラーメッセージが表示される", async () => {
    const user = userEvent.setup();
    startTimerActionMock.mockResolvedValue({ ok: false });
    renderView();

    await user.click(
      screen.getByRole("button", { name: "フリータイマーを開始" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(START_ERROR);
  });
});
