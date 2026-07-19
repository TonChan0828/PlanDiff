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

// 仕様書: docs/specs/P5-4_実績からの再計測.md S3〜S7
// (S1/S2/S9/S10 計測画面は tests/components/track-view.test.tsx、S8 結合は tests/integration/timer-service.test.ts)

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

// 30分(描画高さ28px)= 再計測ボタン表示の境界値ちょうど
const linkedEntry30: TimeEntryItem = {
  id: "entry-linked",
  title: "朝会レビュー",
  googleEventId: "g-review",
  startAt: isoAt(8, 0),
  endAt: isoAt(8, 30),
};

// 15分(描画高さ14px)= 閾値未満
const shortEntry15: TimeEntryItem = {
  id: "entry-short",
  title: "メール処理",
  googleEventId: null,
  startAt: isoAt(9, 0),
  endAt: isoAt(9, 15),
};

const runningEntry: RunningEntry = {
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
      events={[]}
      timeEntries={overrides?.timeEntries ?? [linkedEntry30, shortEntry15]}
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

describe("実績ブロックの再計測ボタン(S3〜S5)", () => {
  it("S3: ▶ボタンを押すと元実績のgoogleEventId・titleで開始され、編集パネルは開かない", async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(
      await screen.findByRole("button", { name: "朝会レビューを再計測" }),
    );

    expect(startTimerActionMock).toHaveBeenCalledWith({
      googleEventId: "g-review",
      title: "朝会レビュー",
    });
    // 楽観的更新で実行中表示になり、編集パネルは開いていない
    expect(screen.getByTestId("running-timer-bar")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("S4: 実行中の実績ブロックには再計測ボタンが表示されない", async () => {
    renderView({ runningEntry, timeEntries: [] });

    // 実行中ブロック自体は描画されている
    expect(await screen.findAllByTestId("actual-block")).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: "設計レビューを再計測" }),
    ).not.toBeInTheDocument();
  });

  it("S5: 30分(28px)の実績にはボタンが表示され、15分(14px)には表示されない", async () => {
    renderView();

    expect(
      await screen.findByRole("button", { name: "朝会レビューを再計測" }),
    ).toBeInTheDocument();
    // 15分ブロックはブロック上のボタンなし(コンテキストパネル側が代替導線)
    const blocks = screen.getAllByTestId("actual-block");
    const shortBlock = blocks.find((block) =>
      within(block).queryByText("メール処理"),
    )!;
    expect(shortBlock).toBeDefined();
    expect(
      within(shortBlock).queryByRole("button", { name: "メール処理を再計測" }),
    ).not.toBeInTheDocument();
  });
});

describe("コンテキストパネルの再計測ボタン(S6)", () => {
  it("S6: パネルの実績リストから再計測でき、鉛筆の編集動線も従来どおり動く", async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(
      screen.getByRole("button", { name: "選択日の詳細を開く" }),
    );
    const panel = screen.getByRole("complementary", { name: "選択日の詳細" });

    await user.click(
      within(panel).getByRole("button", { name: "メール処理を再計測" }),
    );
    expect(startTimerActionMock).toHaveBeenCalledWith({
      googleEventId: null,
      title: "メール処理",
    });

    // 既存の編集動線が壊れていないこと
    await user.click(
      within(panel).getByRole("button", { name: "メール処理の実績を編集" }),
    );
    expect(
      screen.getByRole("dialog", { name: "実績を編集" }),
    ).toBeInTheDocument();
  });
});

describe("再計測失敗時のロールバック(S7)", () => {
  it("S7: 開始アクションが失敗すると日本語エラーが表示され、実行中表示が元に戻る", async () => {
    const user = userEvent.setup();
    startTimerActionMock.mockResolvedValue({ ok: false });
    renderView();

    await user.click(
      await screen.findByRole("button", { name: "朝会レビューを再計測" }),
    );

    expect(await screen.findByText(START_ERROR)).toBeInTheDocument();
    expect(screen.queryByTestId("running-timer-bar")).not.toBeInTheDocument();
  });
});
