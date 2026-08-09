import { describe, expect, it } from "vitest";
import type { DailyGapPoint } from "@/lib/summary/chart";
import {
  formatChartDayLabel,
  formatDailyGapChartLabel,
  formatDailyGapExtremes,
  formatDailyGapPointTitle,
} from "@/lib/summary/format";

// 仕様書: docs/specs/P7-1_サマリーの日別ズレグラフ.md S14〜S20
//
// R-1(CLAUDE.md): 日時はローカルTZで構築する。

function point(
  day: number,
  planMinutes: number,
  actualMinutes: number,
): DailyGapPoint {
  return {
    date: new Date(2026, 7, day),
    planMinutes,
    actualMinutes,
    gapMinutes: actualMinutes - planMinutes,
    isEmpty: planMinutes === 0 && actualMinutes === 0,
  };
}

const RANGE_LABEL = "2026年8月3日〜8月9日";

describe("formatChartDayLabel", () => {
  it("S14: 2026年8月3日は「8/3」になる", () => {
    expect(formatChartDayLabel(new Date(2026, 7, 3))).toBe("8/3");
  });
});

describe("formatDailyGapPointTitle", () => {
  it("S15: 計画120分・実績200分の点は、日付とズレと内訳を含む文言になる", () => {
    expect(formatDailyGapPointTitle(point(3, 120, 200))).toBe(
      "8月3日 +1時間20分(計画 2時間 / 実績 3時間20分)",
    );
  });

  it("S16: ズレがちょうど0の点は「±0分」表記になる", () => {
    expect(formatDailyGapPointTitle(point(3, 60, 60))).toBe(
      "8月3日 ±0分(計画 1時間 / 実績 1時間)",
    );
  });
});

describe("formatDailyGapChartLabel", () => {
  it("S17: 超過日と不足日を含む点列では、見出し・期間・最大超過・最大不足をすべて含む", () => {
    const label = formatDailyGapChartLabel(
      [point(3, 60, 60), point(6, 60, 140), point(9, 190, 60)],
      RANGE_LABEL,
    );

    expect(label).toContain("日別のズレ");
    expect(label).toContain(RANGE_LABEL);
    expect(label).toContain("最大超過 8月6日 +1時間20分");
    expect(label).toContain("最大不足 8月9日 -2時間10分");
  });

  it("S18: 全日ズレ0の点列では、ズレがない旨を示し極値を含まない", () => {
    const label = formatDailyGapChartLabel(
      [point(3, 60, 60), point(4, 0, 0)],
      RANGE_LABEL,
    );

    expect(label).toContain("ズレのある日はありません");
    expect(label).not.toContain("最大超過");
    expect(label).not.toContain("最大不足");
  });
});

describe("formatDailyGapExtremes", () => {
  it("S19: 超過日しかない点列では、最大超過だけを返す", () => {
    const extremes = formatDailyGapExtremes([
      point(3, 60, 90),
      point(6, 60, 140),
    ]);

    expect(extremes).toContain("最大超過 8/6 +1:20");
    expect(extremes).not.toContain("最大不足");
  });

  it("S20: 全日ズレ0の点列では null を返す(極値行を描かない)", () => {
    expect(
      formatDailyGapExtremes([point(3, 60, 60), point(4, 0, 0)]),
    ).toBeNull();
  });
});
