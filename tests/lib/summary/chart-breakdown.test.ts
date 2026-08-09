import { describe, expect, it } from "vitest";
import type { GapSummaryItem, InterruptionItem } from "@/lib/summary/aggregate";
import { computeActualBreakdown } from "@/lib/summary/chart";

// 仕様書: docs/specs/P7-2_サマリーの時間内訳グラフ.md S1〜S16

/** 着手済みの予定行。gapPercent / startDelayMinutes は本集計では使わない */
function item(
  googleEventId: string,
  title: string,
  planMinutes: number,
  actualMinutes: number,
): GapSummaryItem {
  return {
    googleEventId,
    title,
    planMinutes,
    actualMinutes,
    gapMinutes: actualMinutes - planMinutes,
    gapPercent: planMinutes === 0 ? null : 0,
    startDelayMinutes: actualMinutes === 0 ? null : 0,
    notStarted: actualMinutes === 0,
  };
}

function interruption(
  id: string,
  title: string,
  actualMinutes: number,
): InterruptionItem {
  return { id, title, actualMinutes };
}

/** タイトルだけ変えた着手済み予定を n 件つくる */
function items(count: number, minutes: number, prefix = "T"): GapSummaryItem[] {
  return Array.from({ length: count }, (_, index) =>
    item(`g-${prefix}-${index}`, `${prefix}${index}`, minutes, minutes),
  );
}

describe("computeActualBreakdown — 正常系", () => {
  it("S1: 同タイトルの予定2件は1行にまとまり、実績が合算される", () => {
    const breakdown = computeActualBreakdown(
      [
        item("g-1", "設計レビュー", 30, 30),
        item("g-2", "設計レビュー", 45, 45),
      ],
      [],
    );

    expect(breakdown.rows).toHaveLength(1);
    expect(breakdown.rows[0]).toMatchObject({
      title: "設計レビュー",
      actualMinutes: 75,
      plannedMinutes: 75,
      unplannedMinutes: 0,
      count: 2,
      isOther: false,
    });
  });

  it("S2: 同タイトルの割り込み2件は1行にまとまり、割り込みぶんとして合算される", () => {
    const breakdown = computeActualBreakdown(
      [],
      [
        interruption("a-1", "問い合わせ対応", 20),
        interruption("a-2", "問い合わせ対応", 25),
      ],
    );

    expect(breakdown.rows).toHaveLength(1);
    expect(breakdown.rows[0]).toMatchObject({
      title: "問い合わせ対応",
      actualMinutes: 45,
      plannedMinutes: 0,
      unplannedMinutes: 45,
      count: 2,
    });
  });

  it("S3: 同名の予定と割り込みは1行に統合され、内訳を保持する", () => {
    const breakdown = computeActualBreakdown(
      [item("g-1", "レビュー", 60, 60)],
      [interruption("a-1", "レビュー", 30)],
    );

    expect(breakdown.rows).toHaveLength(1);
    expect(breakdown.rows[0]).toMatchObject({
      title: "レビュー",
      actualMinutes: 90,
      plannedMinutes: 60,
      unplannedMinutes: 30,
      count: 2,
    });
  });

  it("S4: 実績時間の降順に並ぶ", () => {
    const breakdown = computeActualBreakdown(
      [
        item("g-1", "実装", 50, 50),
        item("g-2", "設計レビュー", 290, 290),
        item("g-3", "定例", 60, 60),
      ],
      [],
    );

    expect(breakdown.rows.map((row) => row.title)).toEqual([
      "設計レビュー",
      "定例",
      "実装",
    ]);
  });

  it("S5: 実績が同値ならタイトル昇順で並ぶ", () => {
    const breakdown = computeActualBreakdown(
      [item("g-1", "beta", 30, 30), item("g-2", "alpha", 30, 30)],
      [],
    );

    expect(breakdown.rows.map((row) => row.title)).toEqual(["alpha", "beta"]);
  });

  it("S6: totalMinutes が全行の実績合計と一致する", () => {
    const breakdown = computeActualBreakdown(
      [item("g-1", "実装", 50, 50), item("g-2", "設計", 70, 70)],
      [interruption("a-1", "問い合わせ", 30)],
    );

    expect(breakdown.totalMinutes).toBe(150);
    expect(
      breakdown.rows.reduce((sum, row) => sum + row.actualMinutes, 0),
    ).toBe(150);
  });
});

describe("computeActualBreakdown — 異常系", () => {
  it("S7: 未着手の予定だけなら空になり、maxMinutes は0(0除算しない)", () => {
    const breakdown = computeActualBreakdown(
      [item("g-1", "ドキュメント作成", 60, 0)],
      [],
    );

    expect(breakdown.rows).toEqual([]);
    expect(breakdown.totalMinutes).toBe(0);
    expect(breakdown.maxMinutes).toBe(0);
  });

  it("S8: 入力がどちらも空なら、空の集計を返す", () => {
    const breakdown = computeActualBreakdown([], []);

    expect(breakdown.rows).toEqual([]);
    expect(breakdown.otherCount).toBe(0);
    expect(breakdown.totalMinutes).toBe(0);
    expect(breakdown.maxMinutes).toBe(0);
  });

  it("S9: 着手済みと未着手が混在する場合、未着手の予定は行に含まれない", () => {
    const breakdown = computeActualBreakdown(
      [item("g-1", "実装", 50, 50), item("g-2", "ドキュメント作成", 60, 0)],
      [],
    );

    expect(breakdown.rows.map((row) => row.title)).toEqual(["実装"]);
  });
});

describe("computeActualBreakdown — 境界値", () => {
  it("S10: 12タイトルは上位8+その他に畳まれ、合計は丸め前と変わらない", () => {
    const source = Array.from({ length: 12 }, (_, index) =>
      item(`g-${index}`, `T${index}`, 0, (12 - index) * 10),
    );

    const breakdown = computeActualBreakdown(source, []);

    expect(breakdown.rows).toHaveLength(9);
    expect(breakdown.otherCount).toBe(4);
    expect(breakdown.rows[8]?.isOther).toBe(true);
    // 120+110+...+10 = 780
    expect(breakdown.totalMinutes).toBe(780);
    expect(
      breakdown.rows.reduce((sum, row) => sum + row.actualMinutes, 0),
    ).toBe(780);
  });

  it("S11: ちょうど8タイトルなら丸めない", () => {
    const breakdown = computeActualBreakdown(items(8, 30), []);

    expect(breakdown.rows).toHaveLength(8);
    expect(breakdown.otherCount).toBe(0);
    expect(breakdown.rows.some((row) => row.isOther)).toBe(false);
  });

  it("S12: ちょうど9タイトルなら丸めない(「その他(1件)」を作らない)", () => {
    const breakdown = computeActualBreakdown(items(9, 30), []);

    expect(breakdown.rows).toHaveLength(9);
    expect(breakdown.otherCount).toBe(0);
    expect(breakdown.rows.some((row) => row.isOther)).toBe(false);
  });

  it("S13: 10タイトルなら上位8+その他(2件)に畳まれる", () => {
    const breakdown = computeActualBreakdown(items(10, 30), []);

    expect(breakdown.rows).toHaveLength(9);
    expect(breakdown.otherCount).toBe(2);
  });

  it("S14: 「その他」が最大値になっても、どの行も maxMinutes を超えない", () => {
    const top = Array.from({ length: 8 }, (_, index) =>
      item(`g-top-${index}`, `A${index}`, 0, 10),
    );
    const tail = Array.from({ length: 20 }, (_, index) =>
      item(`g-tail-${index}`, `B${index}`, 0, 9),
    );

    const breakdown = computeActualBreakdown([...top, ...tail], []);

    // 畳まれた20件 × 9分 = 180分が最大になる
    expect(breakdown.maxMinutes).toBe(180);
    for (const row of breakdown.rows) {
      expect(row.actualMinutes).toBeLessThanOrEqual(breakdown.maxMinutes);
    }
  });

  it("S15: 「その他」が最大値でも、常に配列の末尾に置かれる", () => {
    const top = Array.from({ length: 8 }, (_, index) =>
      item(`g-top-${index}`, `A${index}`, 0, 10),
    );
    const tail = Array.from({ length: 20 }, (_, index) =>
      item(`g-tail-${index}`, `B${index}`, 0, 9),
    );

    const breakdown = computeActualBreakdown([...top, ...tail], []);

    expect(breakdown.rows.at(-1)?.isOther).toBe(true);
    expect(breakdown.rows.slice(0, -1).some((row) => row.isOther)).toBe(false);
  });

  it("S16: 「その他」に予定と割り込みが混ざる場合、内訳の和が実績合計と一致する", () => {
    const top = Array.from({ length: 8 }, (_, index) =>
      item(`g-top-${index}`, `A${index}`, 0, 100),
    );
    const breakdown = computeActualBreakdown(
      [...top, item("g-tail-1", "B1", 0, 20), item("g-tail-2", "B2", 0, 15)],
      [interruption("a-1", "B3", 10), interruption("a-2", "B4", 5)],
    );

    const other = breakdown.rows.at(-1);
    expect(other?.isOther).toBe(true);
    expect(other?.plannedMinutes).toBe(35);
    expect(other?.unplannedMinutes).toBe(15);
    expect(other?.actualMinutes).toBe(50);
    expect(breakdown.otherCount).toBe(4);
  });
});
