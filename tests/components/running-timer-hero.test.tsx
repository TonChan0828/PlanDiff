import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { RunningTimerHero } from "@/components/running-timer-hero";
import type { RunningEntry } from "@/lib/timer/types";

// 仕様書: docs/specs/D-4_計測ヒーローと開始時刻変更.md S1

const NOW = new Date(2026, 6, 7, 10, 0, 0);

const entry: RunningEntry = {
  id: "entry-run",
  title: "本番障害の対応",
  googleEventId: null,
  startAt: new Date(2026, 6, 7, 9, 0, 0).toISOString(),
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("RunningTimerHero(S1)", () => {
  it("S1: 記録中ラベル・特大経過時間・タイトル・開始時刻ボタン・停止ボタンが表示される", () => {
    render(
      <RunningTimerHero
        entry={entry}
        onStop={() => {}}
        stopping={false}
        onEditStart={() => {}}
      />,
    );

    expect(screen.getByText("記録中")).toBeInTheDocument();
    expect(screen.getByLabelText("経過時間")).toHaveTextContent("1:00:00");
    expect(screen.getByText("本番障害の対応")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "開始 09:00 を変更" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "停止" })).toBeInTheDocument();
  });

  it("S1: 経過時間は1秒ごとに更新される", () => {
    render(
      <RunningTimerHero
        entry={entry}
        onStop={() => {}}
        stopping={false}
        onEditStart={() => {}}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByLabelText("経過時間")).toHaveTextContent("1:00:01");
  });

  it("S1: 停止で onStop、開始時刻ボタンで onEditStart が呼ばれる", () => {
    const onStop = vi.fn();
    const onEditStart = vi.fn();
    render(
      <RunningTimerHero
        entry={entry}
        onStop={onStop}
        stopping={false}
        onEditStart={onEditStart}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "停止" }));
    expect(onStop).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "開始 09:00 を変更" }));
    expect(onEditStart).toHaveBeenCalled();
  });
});
