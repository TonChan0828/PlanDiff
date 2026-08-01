import { describe, expect, it } from "vitest";
import {
  groupInterruptionsByTitle,
  groupItemsByTitle,
  type GapSummaryItem,
  type InterruptionItem,
} from "@/lib/summary/aggregate";

// 仕様書: docs/specs/P5-9_サマリーの任意期間表示.md S21〜S31

function item(
  googleEventId: string,
  title: string,
  planMinutes: number,
  actualMinutes: number,
  startDelayMinutes: number | null = null,
): GapSummaryItem {
  const gapMinutes = actualMinutes - planMinutes;
  return {
    googleEventId,
    title,
    planMinutes,
    actualMinutes,
    gapMinutes,
    gapPercent:
      planMinutes === 0 ? null : Math.round((gapMinutes / planMinutes) * 100),
    startDelayMinutes,
    notStarted: actualMinutes === 0,
  };
}

describe("groupItemsByTitle", () => {
  it("S21: 同タイトル3件が1行に集約され、件数と各合計が正しい", () => {
    const grouped = groupItemsByTitle([
      item("e1", "コードレビュー", 60, 90, 5),
      item("e2", "コードレビュー", 30, 45, 10),
      item("e3", "コードレビュー", 30, 30, 0),
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({
      title: "コードレビュー",
      count: 3,
      planMinutes: 120,
      actualMinutes: 165,
      gapMinutes: 45,
    });
  });

  it("S22: タイトルが異なれば集約されない", () => {
    const grouped = groupItemsByTitle([
      item("e1", "設計", 60, 60),
      item("e2", "実装", 60, 60),
    ]);
    expect(grouped).toHaveLength(2);
    expect(grouped.map((g) => g.title).sort()).toEqual(["実装", "設計"]);
  });

  it("S23: gapPercent は合計値から再計算される", () => {
    const grouped = groupItemsByTitle([
      item("e1", "レビュー", 60, 90),
      item("e2", "レビュー", 60, 90),
    ]);
    expect(grouped[0]!.gapPercent).toBe(50);
  });

  it("S24: 計画0分のみのグループは gapPercent が null(境界値)", () => {
    const grouped = groupItemsByTitle([item("e1", "0分予定", 0, 30)]);
    expect(grouped[0]!.gapPercent).toBeNull();
  });

  it("S25: 平均開始遅延は未着手(null)を除いた平均になる", () => {
    const grouped = groupItemsByTitle([
      item("e1", "会議", 60, 60, 10),
      item("e2", "会議", 60, 60, 20),
      item("e3", "会議", 60, 0, null),
    ]);
    expect(grouped[0]!.averageStartDelayMinutes).toBe(15);
  });

  it("S26: 全件未着手なら平均開始遅延は null・未着手件数が全件になる", () => {
    const grouped = groupItemsByTitle([
      item("e1", "会議", 60, 0, null),
      item("e2", "会議", 30, 0, null),
    ]);
    expect(grouped[0]!.averageStartDelayMinutes).toBeNull();
    expect(grouped[0]!.notStartedCount).toBe(2);
    expect(grouped[0]!.count).toBe(2);
  });

  it("S27: 平均が割り切れないときは四捨五入する(境界値)", () => {
    const grouped = groupItemsByTitle([
      item("e1", "会議", 60, 60, 10),
      item("e2", "会議", 60, 60, 15),
    ]);
    expect(grouped[0]!.averageStartDelayMinutes).toBe(13);
  });

  it("S28: ズレの絶対値が大きい順に並ぶ", () => {
    const grouped = groupItemsByTitle([
      item("e1", "A", 60, 90), // +30
      item("e2", "B", 120, 60), // -60
      item("e3", "C", 60, 70), // +10
    ]);
    expect(grouped.map((g) => g.title)).toEqual(["B", "A", "C"]);
  });

  it("S29: ズレの絶対値が同値ならタイトル昇順に並ぶ", () => {
    const grouped = groupItemsByTitle([
      item("e1", "設計", 60, 90), // +30
      item("e2", "実装", 60, 30), // -30
    ]);
    expect(grouped.map((g) => g.title)).toEqual(["実装", "設計"]);
  });

  it("S30: 空配列なら空配列を返す", () => {
    expect(groupItemsByTitle([])).toEqual([]);
  });
});

describe("groupInterruptionsByTitle", () => {
  it("S31: 割り込みも同タイトルで集約され、件数と合計時間が正しい", () => {
    const interruptions: InterruptionItem[] = [
      { id: "a1", title: "Slack対応", actualMinutes: 15 },
      { id: "a2", title: "Slack対応", actualMinutes: 25 },
      { id: "a3", title: "問い合わせ", actualMinutes: 60 },
    ];
    const grouped = groupInterruptionsByTitle(interruptions);
    expect(grouped).toHaveLength(2);
    expect(grouped[0]).toEqual({
      title: "問い合わせ",
      count: 1,
      actualMinutes: 60,
    });
    expect(grouped[1]).toEqual({
      title: "Slack対応",
      count: 2,
      actualMinutes: 40,
    });
  });

  it("S31: 空配列なら空配列を返す", () => {
    expect(groupInterruptionsByTitle([])).toEqual([]);
  });
});
