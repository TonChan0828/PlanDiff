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

const now = new Date();

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
  vi.clearAllMocks();
  startTimerActionMock.mockResolvedValue({ ok: true });
  stopTimerActionMock.mockResolvedValue({ ok: true });
});

afterEach(() => {
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
