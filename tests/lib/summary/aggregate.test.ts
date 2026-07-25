import { describe, expect, it } from "vitest";
import {
  computeGapSummary,
  type SummaryActualEntry,
  type SummaryPlanEvent,
} from "@/lib/summary/aggregate";

// 仕様書: docs/specs/P3-2_ギャップサマリー.md S1〜S9

function isoAt(day: number, hour: number, minute = 0): string {
  return new Date(2026, 6, day, hour, minute).toISOString();
}

const RANGE = {
  start: new Date(2026, 6, 7),
  end: new Date(2026, 6, 8),
};

function plan(
  googleEventId: string,
  title: string,
  startHour: number,
  endHour: number,
): SummaryPlanEvent {
  return {
    googleEventId,
    title,
    startAt: isoAt(7, startHour),
    endAt: isoAt(7, endHour),
  };
}

function actual(
  id: string,
  googleEventId: string | null,
  title: string,
  startHour: number,
  startMinute: number,
  endHour: number,
  endMinute: number,
): SummaryActualEntry {
  return {
    id,
    googleEventId,
    title,
    startAt: isoAt(7, startHour, startMinute),
    endAt: isoAt(7, endHour, endMinute),
  };
}

describe("computeGapSummary", () => {
  it("S1: 計画と実績が完全一致する予定が1件の場合、ズレはなし", () => {
    const summary = computeGapSummary(
      [plan("g-1", "設計レビュー", 9, 10)],
      [actual("a-1", "g-1", "設計レビュー", 9, 0, 10, 0)],
      RANGE,
    );
    expect(summary.planTotalMinutes).toBe(60);
    expect(summary.actualTotalMinutes).toBe(60);
    expect(summary.gapMinutes).toBe(0);
    expect(summary.gapPercent).toBe(0);
    expect(summary.items).toEqual([
      {
        googleEventId: "g-1",
        title: "設計レビュー",
        planMinutes: 60,
        actualMinutes: 60,
        gapMinutes: 0,
        gapPercent: 0,
        startDelayMinutes: 0,
        notStarted: false,
      },
    ]);
  });

  it("S2: 実績が計画より多い(超過)場合、gapMinutes・gapPercentが正の値になる", () => {
    const summary = computeGapSummary(
      [plan("g-1", "設計レビュー", 9, 10)],
      [actual("a-1", "g-1", "設計レビュー", 9, 0, 10, 30)],
      RANGE,
    );
    expect(summary.gapMinutes).toBe(30);
    expect(summary.gapPercent).toBe(50);
  });

  it("S3: 実績が計画より少ない(早期終了)場合、gapMinutes・gapPercentが負の値になる", () => {
    const summary = computeGapSummary(
      [plan("g-1", "設計レビュー", 9, 10)],
      [actual("a-1", "g-1", "設計レビュー", 9, 0, 9, 30)],
      RANGE,
    );
    expect(summary.gapMinutes).toBe(-30);
    expect(summary.gapPercent).toBe(-50);
  });

  it("S4: 対象範囲内に予定が1件もない場合、gapPercentはnullになる(ゼロ除算にならない)", () => {
    const summary = computeGapSummary(
      [],
      [actual("a-1", null, "読書", 20, 0, 20, 30)],
      RANGE,
    );
    expect(summary.planTotalMinutes).toBe(0);
    expect(summary.gapPercent).toBeNull();
  });

  it("S5: 実績が紐づかない予定(未着手)は、notStarted:trueかつactualMinutes:0になる", () => {
    const summary = computeGapSummary(
      [plan("g-1", "設計レビュー", 9, 10)],
      [],
      RANGE,
    );
    expect(summary.items[0]).toMatchObject({
      notStarted: true,
      actualMinutes: 0,
    });
  });

  it("S6: googleEventIdがnullの実績(フリータイマー)はinterruptionsに含まれる", () => {
    const summary = computeGapSummary(
      [],
      [actual("a-1", null, "読書", 20, 0, 20, 30)],
      RANGE,
    );
    expect(summary.interruptions).toEqual([
      { id: "a-1", title: "読書", actualMinutes: 30 },
    ]);
  });

  it("S7: googleEventIdはあるが対象範囲内の予定に一致するものがない実績はinterruptionsに含まれる", () => {
    const summary = computeGapSummary(
      [],
      [actual("a-1", "g-does-not-exist", "作業", 20, 0, 20, 30)],
      RANGE,
    );
    expect(summary.interruptions).toEqual([
      { id: "a-1", title: "作業", actualMinutes: 30 },
    ]);
  });

  it("S8: 対象範囲外に開始時刻を持つ予定・実績は集計対象から除外される", () => {
    const outOfRangePlan: SummaryPlanEvent = {
      googleEventId: "g-2",
      title: "翌日の予定",
      startAt: isoAt(8, 9, 0),
      endAt: isoAt(8, 10, 0),
    };
    const outOfRangeActual: SummaryActualEntry = {
      id: "a-2",
      googleEventId: null,
      title: "翌日の作業",
      startAt: isoAt(8, 9, 0),
      endAt: isoAt(8, 9, 30),
    };
    const summary = computeGapSummary(
      [outOfRangePlan],
      [outOfRangeActual],
      RANGE,
    );
    expect(summary.items).toHaveLength(0);
    expect(summary.interruptions).toHaveLength(0);
    expect(summary.planTotalMinutes).toBe(0);
    expect(summary.actualTotalMinutes).toBe(0);
  });

  it("S9: 同じ予定に紐づく実績が複数セグメントある場合、actualMinutesは合算される", () => {
    const summary = computeGapSummary(
      [plan("g-1", "設計レビュー", 9, 12)],
      [
        actual("a-1", "g-1", "設計レビュー", 9, 0, 9, 30),
        actual("a-2", "g-1", "設計レビュー", 10, 0, 10, 45),
      ],
      RANGE,
    );
    expect(summary.items[0]?.actualMinutes).toBe(75);
  });
});

// 仕様書: docs/specs/P5-8_予定単位のズレと開始遅延.md S1〜S9
describe("computeGapSummary(P5-8 ズレ%・開始遅延)", () => {
  function planAt(
    googleEventId: string,
    title: string,
    startHour: number,
    startMinute: number,
    endHour: number,
    endMinute: number,
  ): SummaryPlanEvent {
    return {
      googleEventId,
      title,
      startAt: isoAt(7, startHour, startMinute),
      endAt: isoAt(7, endHour, endMinute),
    };
  }

  it("P5-8 S1: 計画60分・実績82分・14分遅れで着手すると gapPercent=37・startDelayMinutes=14", () => {
    const summary = computeGapSummary(
      [planAt("g-1", "設計タスク", 9, 0, 10, 0)],
      [actual("a-1", "g-1", "設計タスク", 9, 14, 10, 36)],
      RANGE,
    );
    expect(summary.items[0]?.gapPercent).toBe(37);
    expect(summary.items[0]?.startDelayMinutes).toBe(14);
  });

  it("P5-8 S2: 計画30分・実績25分・2分遅れで着手すると gapPercent=-17(四捨五入)・startDelayMinutes=2", () => {
    const summary = computeGapSummary(
      [planAt("g-1", "朝会", 9, 0, 9, 30)],
      [actual("a-1", "g-1", "朝会", 9, 2, 9, 27)],
      RANGE,
    );
    expect(summary.items[0]?.gapPercent).toBe(-17);
    expect(summary.items[0]?.startDelayMinutes).toBe(2);
  });

  it("P5-8 S3: 同一予定に実績が複数あるとき開始遅延は最早の実績開始で算出する", () => {
    const summary = computeGapSummary(
      [planAt("g-1", "設計タスク", 10, 0, 12, 0)],
      [
        actual("a-1", "g-1", "設計タスク", 10, 20, 10, 40),
        actual("a-2", "g-1", "設計タスク", 10, 5, 10, 25),
      ],
      RANGE,
    );
    // 最早は 10:05 なので予定開始10:00に対し +5
    expect(summary.items[0]?.startDelayMinutes).toBe(5);
  });

  it("P5-8 S5: 計画0分の予定は gapPercent が null(ゼロ除算にならない)", () => {
    const summary = computeGapSummary(
      [planAt("g-1", "瞬間タスク", 9, 0, 9, 0)],
      [actual("a-1", "g-1", "瞬間タスク", 9, 0, 9, 20)],
      RANGE,
    );
    expect(summary.items[0]?.gapPercent).toBeNull();
  });

  it("P5-8 S6: 未着手の予定は startDelayMinutes=null・gapPercent=-100", () => {
    const summary = computeGapSummary(
      [planAt("g-1", "未着手タスク", 9, 0, 10, 0)],
      [],
      RANGE,
    );
    expect(summary.items[0]?.startDelayMinutes).toBeNull();
    expect(summary.items[0]?.gapPercent).toBe(-100);
  });

  it("P5-8 S8: 予定開始より前に着手すると startDelayMinutes は負(早着手)", () => {
    const summary = computeGapSummary(
      [planAt("g-1", "設計タスク", 10, 0, 11, 0)],
      [actual("a-1", "g-1", "設計タスク", 9, 52, 10, 40)],
      RANGE,
    );
    expect(summary.items[0]?.startDelayMinutes).toBe(-8);
  });

  it("P5-8 S9: 予定開始と同時刻に着手すると startDelayMinutes=0", () => {
    const summary = computeGapSummary(
      [planAt("g-1", "設計タスク", 10, 0, 11, 0)],
      [actual("a-1", "g-1", "設計タスク", 10, 0, 10, 50)],
      RANGE,
    );
    expect(summary.items[0]?.startDelayMinutes).toBe(0);
  });
});
