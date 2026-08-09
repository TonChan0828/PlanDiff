import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SummaryActualBreakdown } from "@/components/summary-actual-breakdown";
import type { ActualBreakdown, ActualBreakdownRow } from "@/lib/summary/chart";

// 仕様書: docs/specs/P7-2_サマリーの時間内訳グラフ.md S21〜S29
//
// props は計算済みの値のみなので、モックは一切不要。

function row(
  title: string,
  plannedMinutes: number,
  unplannedMinutes: number,
  overrides: Partial<ActualBreakdownRow> = {},
): ActualBreakdownRow {
  return {
    title,
    actualMinutes: plannedMinutes + unplannedMinutes,
    plannedMinutes,
    unplannedMinutes,
    count: 1,
    isOther: false,
    ...overrides,
  };
}

function breakdownOf(rows: ActualBreakdownRow[]): ActualBreakdown {
  return {
    rows,
    totalMinutes: rows.reduce((sum, r) => sum + r.actualMinutes, 0),
    maxMinutes: rows.reduce((max, r) => Math.max(max, r.actualMinutes), 0),
    otherCount: rows.at(-1)?.isOther ? (rows.at(-1)?.count ?? 0) : 0,
  };
}

function renderBreakdown(rows: ActualBreakdownRow[]) {
  return render(<SummaryActualBreakdown breakdown={breakdownOf(rows)} />);
}

function rows(): HTMLElement[] {
  return screen.getAllByTestId("breakdown-row");
}

function barsIn(element: HTMLElement) {
  return {
    planned: element.querySelector('[data-testid="breakdown-bar-planned"]'),
    unplanned: element.querySelector('[data-testid="breakdown-bar-unplanned"]'),
  };
}

describe("SummaryActualBreakdown — 正常系", () => {
  it("S21: 各行にタイトル・合計時間・内訳文言が表示される", () => {
    renderBreakdown([
      row("設計レビュー", 290, 0),
      row("実装", 50, 0),
      row("問い合わせ対応", 15, 30),
    ]);

    expect(rows()).toHaveLength(3);

    const first = rows()[0]!;
    expect(within(first).getByText("設計レビュー")).toBeInTheDocument();
    expect(within(first).getByText("4時間50分")).toBeInTheDocument();
    expect(within(first).getByText("予定 4時間50分")).toBeInTheDocument();

    const third = rows()[2]!;
    expect(
      within(third).getByText("予定 15分・割り込み 30分"),
    ).toBeInTheDocument();
  });

  it("S22: 棒の幅は maxMinutes 基準で正規化される", () => {
    // 最大180分に対して90分 → 50%
    renderBreakdown([row("A", 180, 0), row("B", 90, 0)]);

    expect(barsIn(rows()[1]!).planned).toHaveAttribute("width", "50");
    expect(barsIn(rows()[0]!).planned).toHaveAttribute("width", "100");
  });

  it("S23: 混在行では、割り込みの棒が予定の棒の右端から始まる(隙間なく積み上がる)", () => {
    renderBreakdown([row("レビュー", 60, 30)]);

    const { planned, unplanned } = barsIn(rows()[0]!);
    // 最大90分に対し 予定60分 → 66.66…%、割り込み30分 → 33.33…%
    expect(unplanned?.getAttribute("x")).toBe(planned?.getAttribute("width"));
  });

  it("S26: その他の行は畳んだ件数付きのタイトルになる", () => {
    renderBreakdown([
      row("A", 100, 0),
      row("", 25, 15, { isOther: true, count: 4 }),
    ]);

    expect(screen.getByText("その他(4件)")).toBeInTheDocument();
  });
});

describe("SummaryActualBreakdown — 境界値 / アクセシビリティ", () => {
  it("S24: 予定だけの行には割り込みの棒を描かない", () => {
    renderBreakdown([row("設計レビュー", 60, 0)]);

    const { planned, unplanned } = barsIn(rows()[0]!);
    expect(planned).not.toBeNull();
    expect(unplanned).toBeNull();
  });

  it("S25: 割り込みだけの行には予定の棒を描かず、割り込みの棒が左端から始まる", () => {
    renderBreakdown([row("問い合わせ対応", 0, 45)]);

    const { planned, unplanned } = barsIn(rows()[0]!);
    expect(planned).toBeNull();
    expect(unplanned).toHaveAttribute("x", "0");
  });

  it("S27: 行が空なら空メッセージだけを出し、SVGを描かない", () => {
    const { container } = render(
      <SummaryActualBreakdown breakdown={breakdownOf([])} />,
    );

    expect(screen.getByText("この期間の実績はありません")).toBeInTheDocument();
    expect(screen.queryAllByTestId("breakdown-row")).toHaveLength(0);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("S28: 凡例が表示され、棒のSVGは aria-hidden になる", () => {
    const { container } = renderBreakdown([row("設計レビュー", 60, 30)]);

    expect(screen.getByText("予定に紐づく実績")).toBeInTheDocument();
    expect(screen.getByText("割り込み・フリー")).toBeInTheDocument();

    for (const svg of container.querySelectorAll("svg")) {
      expect(svg).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("S29: 上位8+その他の9行がすべて描画される", () => {
    renderBreakdown([
      ...Array.from({ length: 8 }, (_, index) => row(`T${index}`, 100, 0)),
      row("", 40, 10, { isOther: true, count: 2 }),
    ]);

    expect(rows()).toHaveLength(9);
  });
});
