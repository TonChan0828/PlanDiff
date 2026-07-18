import { describe, expect, it } from "vitest";

import { formatSummaryCounts } from "@/lib/summary/format";

// 仕様書: docs/specs/P5-3_サマリー件数ステータス行.md S2・S4〜S6(ステータス行フォーマッタ)

describe("formatSummaryCounts(P5-3)", () => {
  it("S2: 予定5件・着手3・未着手2・割り込み2件(80分)を1行の文言にする", () => {
    expect(
      formatSummaryCounts({
        planCount: 5,
        startedCount: 3,
        notStartedCount: 2,
        interruptionCount: 2,
        interruptionTotalMinutes: 80,
      }),
    ).toBe("予定5件・着手3・未着手2・割り込み2件(1時間20分)");
  });

  it("S4: 予定0件のときは着手・未着手を省略する(境界値)", () => {
    expect(
      formatSummaryCounts({
        planCount: 0,
        startedCount: 0,
        notStartedCount: 0,
        interruptionCount: 1,
        interruptionTotalMinutes: 30,
      }),
    ).toBe("予定0件・割り込み1件(30分)");
  });

  it("S5: 割り込み0件のときは「割り込みなし」で時間表記を省略する(境界値)", () => {
    expect(
      formatSummaryCounts({
        planCount: 3,
        startedCount: 1,
        notStartedCount: 2,
        interruptionCount: 0,
        interruptionTotalMinutes: 0,
      }),
    ).toBe("予定3件・着手1・未着手2・割り込みなし");
  });

  it("S6: 予定0件かつ割り込み0件でも矛盾なく表示できる(境界値)", () => {
    expect(
      formatSummaryCounts({
        planCount: 0,
        startedCount: 0,
        notStartedCount: 0,
        interruptionCount: 0,
        interruptionTotalMinutes: 0,
      }),
    ).toBe("予定0件・割り込みなし");
  });
});
