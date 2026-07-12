import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, act } from "@testing-library/react";

import { RunningTimerBar } from "@/components/running-timer-bar";
import type { RunningEntry } from "@/lib/timer/types";

// 仕様書: docs/specs/P2-2_予定連動タイマー.md S5

const NOW = new Date(2026, 6, 7, 10, 0, 0);

const entry: RunningEntry = {
  id: "entry-run",
  title: "設計レビュー",
  googleEventId: "g-1",
  startAt: new Date(2026, 6, 7, 9, 0, 0).toISOString(),
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("RunningTimerBar(S5)", () => {
  it("S5: タイトルと経過時間が表示され、1秒ごとに更新される", () => {
    render(
      <RunningTimerBar entry={entry} onStop={() => {}} stopping={false} />,
    );

    expect(screen.getByText("設計レビュー")).toBeInTheDocument();
    expect(screen.getByText("1:00:00")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText("1:00:01")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(59_000);
    });
    expect(screen.getByText("1:01:00")).toBeInTheDocument();
  });

  it("S5: タイトルが空なら「(タイトルなし)」を表示する", () => {
    render(
      <RunningTimerBar
        entry={{ ...entry, title: "" }}
        onStop={() => {}}
        stopping={false}
      />,
    );
    expect(screen.getByText("(タイトルなし)")).toBeInTheDocument();
  });

  it("S5: 停止ボタンで onStop が呼ばれる", () => {
    const onStop = vi.fn();
    render(<RunningTimerBar entry={entry} onStop={onStop} stopping={false} />);

    fireEvent.click(screen.getByRole("button", { name: "停止" }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("S5: 停止処理中はボタンが無効化される(連打対策)", () => {
    render(<RunningTimerBar entry={entry} onStop={() => {}} stopping={true} />);
    expect(screen.getByRole("button", { name: "停止" })).toBeDisabled();
  });

  // 仕様書: docs/specs/D-4_計測ヒーローと開始時刻変更.md S6
  it("D-4 S6: onEditStart付きでは開始時刻ボタンが表示され、タップで呼ばれる", () => {
    const onEditStart = vi.fn();
    render(
      <RunningTimerBar
        entry={entry}
        onStop={() => {}}
        stopping={false}
        onEditStart={onEditStart}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "開始 09:00 を変更" }));
    expect(onEditStart).toHaveBeenCalledTimes(1);
  });

  it("D-4 S6: onEditStartなしでは開始時刻ボタンを表示しない(従来互換)", () => {
    render(
      <RunningTimerBar entry={entry} onStop={() => {}} stopping={false} />,
    );
    expect(
      screen.queryByRole("button", { name: "開始 09:00 を変更" }),
    ).not.toBeInTheDocument();
  });
});
