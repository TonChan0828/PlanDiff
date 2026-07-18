import { describe, expect, it } from "vitest";
import {
  computeGapSummary,
  type SummaryActualEntry,
  type SummaryPlanEvent,
} from "@/lib/summary/aggregate";

// 仕様書: docs/specs/P5-3_サマリー件数ステータス行.md S1・S7(件数集計)

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

describe("computeGapSummaryの件数集計(P5-3)", () => {
  it("S1: 予定2件(着手1・未着手1)と割り込み2件(30分+50分)の件数フィールドを返す", () => {
    const summary = computeGapSummary(
      [plan("g-1", "設計レビュー", 9, 10), plan("g-2", "実装", 10, 12)],
      [
        actual("a-1", "g-1", "設計レビュー", 9, 0, 9, 45),
        actual("a-2", null, "障害対応", 13, 0, 13, 30),
        actual("a-3", null, "問い合わせ対応", 14, 0, 14, 50),
      ],
      RANGE,
    );
    expect(summary.planCount).toBe(2);
    expect(summary.startedCount).toBe(1);
    expect(summary.notStartedCount).toBe(1);
    expect(summary.interruptionCount).toBe(2);
    expect(summary.interruptionTotalMinutes).toBe(80);
  });

  it("S7: 0分実績(開始=終了)は予定紐づきなら未着手のまま、割り込みなら件数1・合計0分になる(変則データ)", () => {
    const summary = computeGapSummary(
      [plan("g-1", "設計レビュー", 9, 10)],
      [
        actual("a-1", "g-1", "設計レビュー", 9, 0, 9, 0),
        actual("a-2", null, "誤操作", 13, 0, 13, 0),
      ],
      RANGE,
    );
    expect(summary.planCount).toBe(1);
    expect(summary.startedCount).toBe(0);
    expect(summary.notStartedCount).toBe(1);
    expect(summary.items[0]?.notStarted).toBe(true);
    expect(summary.interruptionCount).toBe(1);
    expect(summary.interruptionTotalMinutes).toBe(0);
  });
});
