import { describe, expect, it } from "vitest";
import {
  computeGapSummary,
  isPartialPeriod,
  type SummaryActualEntry,
  type SummaryPlanEvent,
} from "@/lib/summary/aggregate";
import { computeDailyGapSeries } from "@/lib/summary/chart";

// 仕様書: docs/specs/G-90_サマリーの途中経過と最終結果の分離.md A1〜A10
// 日時はローカルTZで組み立てる(R-1)。asOf も明示的に渡すため実行時刻に依存しない。

const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 10, day, hour, minute);

const DAY = { start: at(21, 0), end: at(22, 0) };

function plan(
  id: string,
  startHour: number,
  endHour: number,
  day = 21,
): SummaryPlanEvent {
  return {
    googleEventId: id,
    title: id,
    startAt: at(day, startHour).toISOString(),
    endAt: at(day, endHour).toISOString(),
  };
}

function actual(
  id: string,
  googleEventId: string | null,
  startHour: number,
  startMinute: number,
  endHour: number,
  endMinute: number,
): SummaryActualEntry {
  return {
    id,
    googleEventId,
    title: id,
    startAt: at(21, startHour, startMinute).toISOString(),
    endAt: at(21, endHour, endMinute).toISOString(),
  };
}

// Issueの実例に近い一日: 朝(1h)・昼(1h)・夜(4h40m)。10:20時点では夜がこれから
const MORNING = plan("morning", 9, 10);
const NOON = plan("noon", 10, 11);
const NIGHT: SummaryPlanEvent = {
  googleEventId: "night",
  title: "night",
  startAt: at(21, 18, 25).toISOString(),
  endAt: at(21, 23, 5).toISOString(),
};

describe("computeGapSummary の asOf(G-90)", () => {
  it("A1: 開始が未来の予定は、計画・件数・内訳から除かれる", () => {
    const summary = computeGapSummary(
      [MORNING, NOON, NIGHT],
      [actual("a1", "morning", 9, 0, 9, 51)],
      DAY,
      at(21, 10, 20),
    );

    expect(summary.planCount).toBe(2);
    expect(summary.planTotalMinutes).toBe(120);
    expect(summary.items.map((i) => i.googleEventId)).toEqual([
      "morning",
      "noon",
    ]);
    expect(summary.gapMinutes).toBe(51 - 120);
    expect(summary.notStartedCount).toBe(1);
  });

  it("A2: 開始が asOf ちょうどの予定は含まれ、1分後の予定は除かれる", () => {
    const events = [plan("exact", 10, 11), plan("later", 11, 12)];

    const onTheMinute = computeGapSummary(events, [], DAY, at(21, 10, 0));
    const oneMinuteBefore = computeGapSummary(events, [], DAY, at(21, 9, 59));

    expect(onTheMinute.items.map((i) => i.googleEventId)).toEqual(["exact"]);
    expect(oneMinuteBefore.items).toEqual([]);
  });

  it("A3: 実行中の予定は、全計画時間で数える", () => {
    const summary = computeGapSummary(
      [plan("running", 9, 10)],
      [actual("a1", "running", 9, 0, 9, 30)],
      DAY,
      at(21, 9, 30),
    );

    expect(summary.planTotalMinutes).toBe(60);
    expect(summary.actualTotalMinutes).toBe(30);
    expect(summary.gapMinutes).toBe(-30);
  });

  it("A4: 期間が終わっていれば、asOf なしと完全に同じ結果になる", () => {
    const events = [MORNING, NOON, NIGHT];
    const actuals = [actual("a1", "morning", 9, 0, 9, 51)];

    const withAsOf = computeGapSummary(events, actuals, DAY, at(22, 0, 1));
    const without = computeGapSummary(events, actuals, DAY);

    expect(withAsOf).toEqual(without);
  });

  it("A6: asOf を省略すると、未来の予定も数える(従来の動作)", () => {
    const summary = computeGapSummary([MORNING, NIGHT], [], DAY);

    expect(summary.planCount).toBe(2);
  });

  it("A7: 経過した予定が0件なら、計画0・ズレ0・ズレ%は null になる", () => {
    const summary = computeGapSummary([NIGHT], [], DAY, at(21, 6, 0));

    expect(summary.planTotalMinutes).toBe(0);
    expect(summary.gapMinutes).toBe(0);
    expect(summary.gapPercent).toBeNull();
  });

  it("A8: 割り込み実績は、従来どおり実績として数える", () => {
    const summary = computeGapSummary(
      [NIGHT],
      [actual("free", null, 9, 0, 9, 40)],
      DAY,
      at(21, 10, 20),
    );

    expect(summary.interruptionCount).toBe(1);
    expect(summary.actualTotalMinutes).toBe(40);
    expect(summary.planTotalMinutes).toBe(0);
  });

  it("A9: 未来の予定を前倒しで着手済みなら、経過した予定として数え、割り込みにしない", () => {
    const summary = computeGapSummary(
      [NIGHT],
      [actual("early", "night", 10, 0, 10, 30)],
      DAY,
      at(21, 10, 20),
    );

    expect(summary.interruptionCount).toBe(0);
    expect(summary.planCount).toBe(1);
    expect(summary.items[0]!.actualMinutes).toBe(30);
    expect(summary.planTotalMinutes).toBe(280);
  });
});

describe("computeDailyGapSeries の asOf(G-90)", () => {
  const WEEK = { start: at(16, 0), end: at(23, 0) };

  it("A10: 未来の日の予定は不足に現れず、総和はヒーロー集計と一致する", () => {
    const events = [
      plan("today", 9, 10, 21),
      plan("tomorrow", 9, 11, 22),
      plan("later-today", 18, 20, 21),
    ];
    const actuals = [actual("a1", "today", 9, 0, 9, 45)];
    const asOf = at(21, 10, 20);

    const series = computeDailyGapSeries(events, actuals, WEEK, asOf);
    const summary = computeGapSummary(events, actuals, WEEK, asOf);

    const tomorrow = series[6]!;
    expect(tomorrow.planMinutes).toBe(0);
    expect(tomorrow.isEmpty).toBe(true);
    expect(series.reduce((sum, p) => sum + p.gapMinutes, 0)).toBe(
      summary.gapMinutes,
    );
    expect(series.reduce((sum, p) => sum + p.planMinutes, 0)).toBe(60);
  });

  it("前倒しで着手済みの未来の予定は、日別系列でも数える", () => {
    const events = [plan("tomorrow", 9, 11, 22)];
    const actuals = [actual("early", "tomorrow", 9, 0, 9, 30)];

    const series = computeDailyGapSeries(events, actuals, WEEK, at(21, 10, 20));
    const summary = computeGapSummary(events, actuals, WEEK, at(21, 10, 20));

    expect(series.reduce((sum, p) => sum + p.planMinutes, 0)).toBe(120);
    expect(series.reduce((sum, p) => sum + p.gapMinutes, 0)).toBe(
      summary.gapMinutes,
    );
  });

  it("asOf を省略すると、未来の予定も数える(従来の動作)", () => {
    const series = computeDailyGapSeries(
      [plan("tomorrow", 9, 11, 22)],
      [],
      WEEK,
    );

    expect(series[6]!.planMinutes).toBe(120);
  });
});

describe("isPartialPeriod(G-90)", () => {
  it("A5: 期間の途中だけ true。開始ちょうどは true、終了ちょうど・未来・過去は false", () => {
    expect(isPartialPeriod(DAY, at(21, 10, 20))).toBe(true);
    expect(isPartialPeriod(DAY, at(21, 0, 0))).toBe(true);
    expect(isPartialPeriod(DAY, at(22, 0, 0))).toBe(false);
    expect(isPartialPeriod(DAY, at(20, 23, 59))).toBe(false);
    expect(isPartialPeriod(DAY, at(25, 12, 0))).toBe(false);
  });
});
