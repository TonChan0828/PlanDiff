import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { format } from "date-fns";

const {
  routerMock,
  startTimerActionMock,
  stopTimerActionMock,
  updateRunningStartActionMock,
  createAppEventActionMock,
} = vi.hoisted(() => ({
  routerMock: { refresh: vi.fn(), push: vi.fn() },
  startTimerActionMock: vi.fn(),
  stopTimerActionMock: vi.fn(),
  updateRunningStartActionMock: vi.fn(),
  createAppEventActionMock: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => routerMock }));
vi.mock("@/app/(app)/calendar/timer-actions", () => ({
  startTimerAction: startTimerActionMock,
  stopTimerAction: stopTimerActionMock,
  updateRunningStartAction: updateRunningStartActionMock,
}));
vi.mock("@/app/(app)/calendar/event-actions", () => ({
  createAppEventAction: createAppEventActionMock,
}));

import { TrackView } from "@/components/track-view";
import type { RunningEntry } from "@/lib/timer/types";

// 仕様書: docs/specs/D-4_計測ヒーローと開始時刻変更.md S2・S5(計測画面での連携)

// 実日時に対して過去になるよう固定の過去日時を使う(未来バリデーションを通すため)
const START = new Date(2026, 6, 7, 9, 0, 0);

const runningEntry: RunningEntry = {
  id: "entry-run",
  title: "本番障害の対応",
  googleEventId: null,
  startAt: START.toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("計測画面の開始時刻変更(S2 / S5)", () => {
  it("S2: ヒーローの開始時刻ボタンでパネルが開き、初期値が現在の開始時刻になる", async () => {
    const user = userEvent.setup();
    render(
      <TrackView events={[]} timeEntries={[]} runningEntry={runningEntry} />,
    );

    await user.click(screen.getByRole("button", { name: "開始 09:00 を変更" }));

    expect(
      screen.getByRole("dialog", { name: "開始時刻を変更" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("開始時刻")).toHaveValue(
      format(START, "yyyy-MM-dd'T'HH:mm"),
    );
  });

  it("S5: 有効な時刻で保存するとActionが呼ばれ、成功でパネルが閉じrefreshされる", async () => {
    updateRunningStartActionMock.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(
      <TrackView events={[]} timeEntries={[]} runningEntry={runningEntry} />,
    );

    await user.click(screen.getByRole("button", { name: "開始 09:00 を変更" }));
    const newStart = new Date(2026, 6, 7, 8, 15, 0);
    await user.clear(screen.getByLabelText("開始時刻"));
    await user.type(
      screen.getByLabelText("開始時刻"),
      format(newStart, "yyyy-MM-dd'T'HH:mm"),
    );
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(updateRunningStartActionMock).toHaveBeenCalledWith(
      newStart.toISOString(),
    );
    await vi.waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "開始時刻を変更" }),
      ).not.toBeInTheDocument();
    });
    expect(routerMock.refresh).toHaveBeenCalled();
  });

  it("S5: Actionが失敗するとパネルは閉じず日本語エラーが表示される", async () => {
    updateRunningStartActionMock.mockResolvedValue({ ok: false });
    const user = userEvent.setup();
    render(
      <TrackView events={[]} timeEntries={[]} runningEntry={runningEntry} />,
    );

    await user.click(screen.getByRole("button", { name: "開始 09:00 を変更" }));
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(
      await screen.findByText("開始時刻を変更できませんでした"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "開始時刻を変更" }),
    ).toBeInTheDocument();
  });
});
