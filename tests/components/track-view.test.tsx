import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
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
const EMPTY_ENTRIES = "実績はまだありません";

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

describe("実績リスト(S7/S8/S17)", () => {
  it("S7: 「予定にする」ボタンはフリー実績の行にのみ表示される", () => {
    renderView({ timeEntries: [freeEntry, linkedEntry] });

    const list = screen.getByRole("list", { name: "今日" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);

    expect(
      screen.getByRole("button", { name: "リファクタリングを予定にする" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "設計レビューを予定にする" }),
    ).not.toBeInTheDocument();
  });

  it("S8: 実績がゼロ件のとき空状態メッセージが表示される", () => {
    renderView({ timeEntries: [] });

    expect(screen.getByText(EMPTY_ENTRIES)).toBeInTheDocument();
  });

  it("S17: 今日と過去日の実績が日付見出しごとに分かれ、過去日の実績も表示される", () => {
    // 昨日正午の実績(TZ差でも前日に収まるよう正午基準)
    const yesterdayEntry: TimeEntryItem = {
      id: "entry-yesterday",
      title: "昨日の調査",
      googleEventId: null,
      startAt: subHours(now, 24).toISOString(),
      endAt: subHours(now, 23).toISOString(),
    };
    renderView({ timeEntries: [freeEntry, yesterdayEntry] });

    // 当日グループ「今日」に本日実績
    const todayList = screen.getByRole("list", { name: "今日" });
    expect(within(todayList).getByText("リファクタリング")).toBeInTheDocument();

    // 過去日グループにも実績が表示される(見出しは「今日」ではない)
    expect(screen.getByText("昨日の調査")).toBeInTheDocument();
    const lists = screen.getAllByRole("list");
    expect(lists.length).toBeGreaterThanOrEqual(2);
  });

  it("S7補: 「予定にする」をタップすると翌日同時刻を初期値にした予定作成ダイアログが開く", async () => {
    const user = userEvent.setup();
    renderView({ timeEntries: [freeEntry] });

    await user.click(
      screen.getByRole("button", { name: "リファクタリングを予定にする" }),
    );

    // パネルは next/dynamic で遅延ロードされるため解決を待つ(P6-3)
    const dialog = await screen.findByRole("dialog", { name: "予定を追加" });
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

// 仕様書: docs/specs/P8-2_計測画面の日付またぎ.md S18〜S20
// R-1: 日時はすべてローカルTZで構築する(ISO文字列で固定しない)
describe("日付またぎ(S18〜S20)", () => {
  // 2026-08-11(火) 23:59:30 — 0時まで30秒
  const LATE_NIGHT = new Date(2026, 7, 11, 23, 59, 30);

  beforeEach(() => {
    vi.setSystemTime(LATE_NIGHT);
  });

  it("S18: 0時をまたぐと新しい当日分の実績が「未来日」扱いで除外されなくなる", () => {
    // 日付が変わった直後(0:00:30)の実績。0時をまたぐ前は「未来日」として除外される
    const newDayEntry: TimeEntryItem = {
      id: "entry-new-day",
      title: "深夜作業",
      googleEventId: null,
      startAt: new Date(2026, 7, 12, 0, 0, 30).toISOString(),
      endAt: new Date(2026, 7, 12, 0, 30, 0).toISOString(),
    };
    renderView({ timeEntries: [newDayEntry] });

    expect(screen.queryByText("深夜作業")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(31_000);
    });

    const todayList = screen.getByRole("list", { name: "今日" });
    expect(within(todayList).getByText("深夜作業")).toBeInTheDocument();
  });

  it("S19: 0時をまたぐと新しい当日の予定が「今の予定から開始」候補に入る", () => {
    const newDayEvent = quickEvent(
      "new-day",
      "設計会議",
      new Date(2026, 7, 12, 0, 5, 0),
      new Date(2026, 7, 12, 1, 0, 0),
    );
    renderView({ events: [newDayEvent] });

    expect(screen.queryByText("今の予定から開始")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(31_000);
    });

    expect(
      screen.getByRole("button", { name: "設計会議のタイマーを開始" }),
    ).toBeInTheDocument();
  });

  it("S20: 0時をまたいで終了時刻を過ぎた予定は「進行中」候補から外れる", () => {
    // 前日22:00に始まり、日付が変わった2分後(0:02)に終わる予定
    const crossingEvent = quickEvent(
      "crossing",
      "夜間監視",
      new Date(2026, 7, 11, 22, 0, 0),
      new Date(2026, 7, 12, 0, 2, 0),
    );
    renderView({ events: [crossingEvent] });

    expect(
      screen.getByRole("button", { name: "夜間監視のタイマーを開始" }),
    ).toBeInTheDocument();

    // 23:59:30 から 00:05:30 まで進める(終了時刻00:02を過ぎる)
    act(() => {
      vi.advanceTimersByTime(6 * 60_000);
    });

    expect(screen.queryByText("今の予定から開始")).not.toBeInTheDocument();
  });
});
