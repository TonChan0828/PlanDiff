import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SummaryDailyGapChart } from "@/components/summary-daily-gap-chart";
import type { DailyGapPoint } from "@/lib/summary/chart";

// 仕様書: docs/specs/P7-1_サマリーの日別ズレグラフ.md S21〜S31
//
// R-1(CLAUDE.md): 日時はローカルTZで構築する。
// props は計算済みの値のみなので、モックは一切不要。

const RANGE_LABEL = "2026年8月3日〜8月9日";

/** ズレ(分)から1点を組み立てる。gap===null はデータなしの日 */
function point(day: number, gapMinutes: number | null): DailyGapPoint {
  if (gapMinutes === null) {
    return {
      date: new Date(2026, 7, day),
      planMinutes: 0,
      actualMinutes: 0,
      gapMinutes: 0,
      isEmpty: true,
    };
  }
  return {
    date: new Date(2026, 7, day),
    planMinutes: 60,
    actualMinutes: 60 + gapMinutes,
    gapMinutes,
    isEmpty: false,
  };
}

function seriesOfDays(dayCount: number): DailyGapPoint[] {
  return Array.from({ length: dayCount }, (_, index) => ({
    date: new Date(2026, 0, 1 + index),
    planMinutes: 60,
    actualMinutes: 90,
    gapMinutes: 30,
    isEmpty: false,
  }));
}

function renderChart(points: DailyGapPoint[]) {
  return render(
    <SummaryDailyGapChart points={points} rangeLabel={RANGE_LABEL} />,
  );
}

function bars(): HTMLElement[] {
  return screen.getAllByTestId("daily-gap-bar");
}

describe("SummaryDailyGapChart — 正常系", () => {
  it("S21: 7点を渡すと棒が7本描かれ、viewBox が日数ぶんの幅になる", () => {
    const { container } = renderChart([
      point(3, 30),
      point(4, -30),
      point(5, 0),
      point(6, null),
      point(7, 15),
      point(8, -15),
      point(9, 60),
    ]);

    expect(bars()).toHaveLength(7);
    expect(container.querySelector("svg")).toHaveAttribute(
      "viewBox",
      "0 0 70 100",
    );
  });

  it("S22: 超過・不足・ズレ0・データなしの4日は、data-sign で描き分けられる", () => {
    renderChart([point(3, 30), point(4, -60), point(5, 0), point(6, null)]);

    expect(bars().map((bar) => bar.getAttribute("data-sign"))).toEqual([
      "over",
      "under",
      "zero",
      "empty",
    ]);
  });

  it("S23: +60分と-30分では、超過側の棒の高さが不足側の2倍になる(上下共通スケール)", () => {
    renderChart([point(3, 60), point(4, -30)]);

    const heights = bars().map((bar) => Number(bar.getAttribute("height")));
    expect(heights[0]).toBeCloseTo((heights[1] ?? 0) * 2, 5);
  });

  it("S24: 超過は柿(interrupt)、不足は群青(brand)のトークンで塗られる", () => {
    renderChart([point(3, 30), point(4, -30)]);

    const classes = bars().map((bar) => bar.getAttribute("class"));
    expect(classes[0]).toContain("fill-interrupt");
    expect(classes[1]).toContain("fill-brand");
  });

  it("S25: SVGに role=img と要約 aria-label が付き、各棒に title がある", () => {
    renderChart([point(3, 30), point(4, -30)]);

    const svg = screen.getByRole("img");
    const label = svg.getAttribute("aria-label") ?? "";
    expect(label).toContain("日別のズレ");
    expect(label).toContain(RANGE_LABEL);

    for (const bar of bars()) {
      const group = bar.parentElement;
      expect(group?.querySelector("title")?.textContent).toBeTruthy();
    }
  });
});

describe("SummaryDailyGapChart — 境界値", () => {
  it("S26: 1分のズレでも、600分のズレと並べたとき棒が消えない", () => {
    renderChart([point(3, 1), point(4, 600)]);

    const heights = bars().map((bar) => Number(bar.getAttribute("height")));
    expect(heights[0]).toBeGreaterThanOrEqual(1.2);
  });

  it("S27: 7日(密モードの上限)ではX軸ラベルが7個表示される", () => {
    renderChart(seriesOfDays(7));

    expect(screen.getAllByTestId("daily-gap-day-label")).toHaveLength(7);
  });

  it("S28: 31日ではX軸ラベルが3個(初日/中間/最終)に間引かれる", () => {
    renderChart(seriesOfDays(31));

    const labels = screen.getAllByTestId("daily-gap-day-label");
    expect(labels).toHaveLength(3);
    expect(labels[0]).toHaveTextContent("1/1");
    expect(labels[2]).toHaveTextContent("1/31");
  });

  it("S29: 366日でも棒は366本、ラベルは3個、viewBoxの幅は3660になる", () => {
    const { container } = renderChart(seriesOfDays(366));

    expect(bars()).toHaveLength(366);
    expect(screen.getAllByTestId("daily-gap-day-label")).toHaveLength(3);
    expect(container.querySelector("svg")).toHaveAttribute(
      "viewBox",
      "0 0 3660 100",
    );
  });

  it("S30: 全日ズレ0のとき、極値行を描かず aria-label でズレなしを伝える", () => {
    renderChart([point(3, 0), point(4, null), point(5, 0)]);

    expect(screen.queryByTestId("daily-gap-extremes")).not.toBeInTheDocument();
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain(
      "ズレのある日はありません",
    );
  });

  it("S31: 0軸線には vectorEffect=non-scaling-stroke が付く(横伸縮で線が潰れない)", () => {
    renderChart([point(3, 30), point(4, -30)]);

    expect(screen.getByTestId("daily-gap-zero-line")).toHaveAttribute(
      "vector-effect",
      "non-scaling-stroke",
    );
  });
});
