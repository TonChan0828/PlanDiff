import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditEntryPanel } from "@/components/edit-entry-panel";
import { RunningTimerBar } from "@/components/running-timer-bar";
import { RunningTimerHero } from "@/components/running-timer-hero";

// 仕様書: docs/specs/G-91_タイマーの止め忘れ対策.md I4〜I6
// 現在時刻で結果が変わるため、時刻を固定する(R-1)。日時はローカルTZで組み立てる

const iso = (hour: number, minute = 0) =>
  new Date(2026, 10, 24, hour, minute).toISOString();

const LONG = "6時間以上計測しています。止め忘れではありませんか?";
const OVERRUN = "予定の終了(10:00)を過ぎて計測しています";
const PLAN = { googleEventId: "g-1", startAt: iso(9), endAt: iso(10) };
const ENTRY = {
  id: "r1",
  title: "設計",
  googleEventId: "g-1",
  startAt: iso(9),
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 24, 10, 14));
});

afterEach(() => {
  vi.useRealTimers();
});

const advanceMinutes = (minutes: number) =>
  act(() => {
    vi.advanceTimersByTime(minutes * 60_000);
  });

describe.each([
  [
    "実行中バー",
    (plan?: typeof PLAN) => (
      <RunningTimerBar
        entry={ENTRY}
        plan={plan}
        onStop={vi.fn()}
        stopping={false}
      />
    ),
  ],
  [
    "計測ヒーロー",
    (plan?: typeof PLAN) => (
      <RunningTimerHero
        entry={ENTRY}
        plan={plan}
        onStop={vi.fn()}
        stopping={false}
        onEditStart={vi.fn()}
      />
    ),
  ],
])("%s の警告(G-91 I4)", (_name, view) => {
  it("時間が進むと、予定超過、続いて長時間の警告が現れる。停止ボタンは変わらない", () => {
    render(view(PLAN));
    expect(screen.queryByText(OVERRUN)).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();

    advanceMinutes(1); // 10:15
    expect(screen.getByText(OVERRUN)).toBeInTheDocument();
    expect(screen.queryByText(LONG)).not.toBeInTheDocument();

    advanceMinutes(285); // 15:00(開始から6時間)
    expect(screen.getByText(LONG)).toBeInTheDocument();
    expect(screen.getByText(OVERRUN)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "停止" })).toBeEnabled();
  });

  it("予定が分からなければ、長時間の警告だけを出す", () => {
    render(view(undefined));

    advanceMinutes(300);

    expect(screen.getByText(LONG)).toBeInTheDocument();
    expect(screen.queryByText(/予定の終了/)).not.toBeInTheDocument();
  });
});

describe("実績の編集パネルの止め忘れの目印と候補(G-91 I5・I6)", () => {
  function renderPanel({ endHour = 18, linked = true, onSave = vi.fn() } = {}) {
    const entry = {
      id: "a",
      title: "設計",
      startAt: iso(9),
      endAt: iso(endHour),
    };
    render(
      <EditEntryPanel
        entry={entry}
        planContext={
          linked
            ? {
                plan: PLAN,
                actuals: [{ ...entry, googleEventId: "g-1" }],
              }
            : undefined
        }
        onSave={onSave}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        pending={false}
        error={null}
      />,
    );
    return onSave;
  }

  const NOTE = "止め忘れの可能性があります(6時間以上)";
  const APPLY = "終了を予定の終了(10:00)にする";

  it("I5: 候補を押すと終了の入力とズレの欄が変わり、保存するまで確定しない", () => {
    const onSave = renderPanel();
    expect(screen.getByText(NOTE)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: APPLY }));

    expect(screen.getByLabelText("終了時刻")).toHaveValue("2026-11-24T10:00");
    expect(
      within(screen.getByRole("group", { name: "予定とのズレ" })).getByText(
        "所要 予定どおり",
      ),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    // 直したあとは長時間でないため、目印と候補は消える
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: APPLY }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ endAt: iso(10) }),
    );
  });

  it("I6: フリー実績は目印だけで、候補は出さない", () => {
    renderPanel({ linked: false });

    expect(screen.getByText(NOTE)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /終了を予定の終了/ }),
    ).not.toBeInTheDocument();
  });

  it("I6: 長時間でない実績には、予定を超えていても何も出さない", () => {
    renderPanel({ endHour: 12 });

    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /終了を予定の終了/ }),
    ).not.toBeInTheDocument();
  });
});
