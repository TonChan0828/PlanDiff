import { describe, expect, it } from "vitest";
import type { ActualBreakdownRow } from "@/lib/summary/chart";
import {
  formatBreakdownKinds,
  formatBreakdownOtherTitle,
} from "@/lib/summary/format";

// 仕様書: docs/specs/P7-2_サマリーの時間内訳グラフ.md S17〜S20

function row(
  plannedMinutes: number,
  unplannedMinutes: number,
): ActualBreakdownRow {
  return {
    title: "作業",
    actualMinutes: plannedMinutes + unplannedMinutes,
    plannedMinutes,
    unplannedMinutes,
    count: 1,
    isOther: false,
  };
}

describe("formatBreakdownKinds", () => {
  it("S17: 予定だけの行は「予定 …」のみになる", () => {
    expect(formatBreakdownKinds(row(290, 0))).toBe("予定 4時間50分");
  });

  it("S18: 割り込みだけの行は「割り込み …」のみになる", () => {
    expect(formatBreakdownKinds(row(0, 45))).toBe("割り込み 45分");
  });

  it("S19: 混在の行は両方を区切って並べる", () => {
    expect(formatBreakdownKinds(row(15, 30))).toBe("予定 15分・割り込み 30分");
  });
});

describe("formatBreakdownOtherTitle", () => {
  it("S20: 畳んだ件数付きのタイトルになる", () => {
    expect(formatBreakdownOtherTitle(4)).toBe("その他(4件)");
  });
});
