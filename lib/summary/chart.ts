import { addDays, differenceInCalendarDays, parseISO } from "date-fns";
import {
  durationMinutes,
  isStartInRange,
  type SummaryActualEntry,
  type SummaryPlanEvent,
  type SummaryRange,
} from "@/lib/summary/aggregate";

// サマリーのグラフ用集計(P7-1)。仕様書: docs/specs/P7-1_サマリーの日別ズレグラフ.md
//
// 集計規則は computeGapSummary と完全に一致させる(「開始時刻が期間内」のものだけを
// その開始日に全量計上する)。これにより系列の総和がヒーローの集計値と必ず一致する。
// この不変条件はテスト S10 で固定している。

/** 発散棒グラフ1本ぶん(1日) */
export interface DailyGapPoint {
  /** その日のローカル0時 */
  date: Date;
  planMinutes: number;
  actualMinutes: number;
  /** actualMinutes - planMinutes。正=超過・負=不足 */
  gapMinutes: number;
  /** 予定も実績も0件の日。「ズレがちょうど0の日」と区別するために持つ */
  isEmpty: boolean;
}

/**
 * 期間内の日ごとの「計画 / 実績 / ズレ」を出す(P7-1)。
 * データのない日も isEmpty: true で埋めるため、戻り値は必ず期間の日数ぶんになる。
 */
export function computeDailyGapSeries(
  planEvents: SummaryPlanEvent[],
  actualEntries: SummaryActualEntry[],
  range: SummaryRange,
): DailyGapPoint[] {
  const dayCount = differenceInCalendarDays(range.end, range.start);
  if (dayCount <= 0) {
    return [];
  }

  const points: DailyGapPoint[] = Array.from(
    { length: dayCount },
    (_, index) => ({
      date: addDays(range.start, index),
      planMinutes: 0,
      actualMinutes: 0,
      gapMinutes: 0,
      isEmpty: true,
    }),
  );

  /** 開始時刻の属する日のindexを返す。期間外なら null */
  const dayIndexOf = (startAt: string): number | null => {
    if (!isStartInRange(startAt, range)) {
      return null;
    }
    const index = differenceInCalendarDays(parseISO(startAt), range.start);
    // isStartInRange を通っていれば範囲内に収まるが、DST等で境界がずれても
    // 配列外アクセスにならないよう防御しておく
    return index >= 0 && index < dayCount ? index : null;
  };

  for (const event of planEvents) {
    const index = dayIndexOf(event.startAt);
    const point = index === null ? undefined : points[index];
    if (!point) continue;
    point.planMinutes += durationMinutes(event.startAt, event.endAt);
    point.isEmpty = false;
  }

  // 実績は予定への紐づきの有無を問わず加算する(割り込み・フリー作業も
  // 「その日に使った時間」なのでズレに寄与する。computeGapSummary の
  // actualTotalMinutes と同じ扱い)
  for (const entry of actualEntries) {
    const index = dayIndexOf(entry.startAt);
    const point = index === null ? undefined : points[index];
    if (!point) continue;
    point.actualMinutes += durationMinutes(entry.startAt, entry.endAt);
    point.isEmpty = false;
  }

  for (const point of points) {
    point.gapMinutes = point.actualMinutes - point.planMinutes;
  }

  return points;
}
