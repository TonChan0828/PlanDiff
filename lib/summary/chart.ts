import { addDays, differenceInCalendarDays, parseISO } from "date-fns";
import {
  durationMinutes,
  isStartInRange,
  type GapSummaryItem,
  type InterruptionItem,
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

// 時間の内訳(横棒グラフ)の集計(P7-2)。仕様書: docs/specs/P7-2_サマリーの時間内訳グラフ.md
//
// 生データは不要で、computeGapSummary の出力(items / interruptions)から導出する。

/** 横棒グラフ1行ぶん */
export interface ActualBreakdownRow {
  /** isOther のときは空文字。表示文言は format 側で組み立てる */
  title: string;
  /** plannedMinutes + unplannedMinutes */
  actualMinutes: number;
  /** 予定に紐づく実績(群青) */
  plannedMinutes: number;
  /** 割り込み・フリー作業(柿) */
  unplannedMinutes: number;
  /** 通常行は畳んだ予定+割り込みの件数、isOther 行は畳んだタイトル数 */
  count: number;
  isOther: boolean;
}

export interface ActualBreakdown {
  rows: ActualBreakdownRow[];
  /** 全行の合計。丸め込みの前後で不変 */
  totalMinutes: number;
  /** 棒の正規化に使う。丸め込み後の rows の最大値 */
  maxMinutes: number;
  /** 畳まれたタイトル数。0 なら丸めなし */
  otherCount: number;
}

/** 「その他」に畳むまでに表示する行数の上限 */
export const BREAKDOWN_TOP_N = 8;

/**
 * 実績時間を作業タイトル別に集約する(P7-2)。
 * 同名の予定と割り込みは1行に統合し、行内で内訳(planned / unplanned)を保持する。
 * 未着手(actualMinutes === 0)の予定は「時間の内訳」の趣旨に合わないため含めない。
 */
export function computeActualBreakdown(
  items: GapSummaryItem[],
  interruptions: InterruptionItem[],
  options?: { limit?: number },
): ActualBreakdown {
  const limit = options?.limit ?? BREAKDOWN_TOP_N;
  const byTitle = new Map<string, ActualBreakdownRow>();

  const rowFor = (title: string): ActualBreakdownRow => {
    const existing = byTitle.get(title);
    if (existing) {
      return existing;
    }
    const created: ActualBreakdownRow = {
      title,
      actualMinutes: 0,
      plannedMinutes: 0,
      unplannedMinutes: 0,
      count: 0,
      isOther: false,
    };
    byTitle.set(title, created);
    return created;
  };

  for (const item of items) {
    if (item.actualMinutes <= 0) continue;
    const row = rowFor(item.title);
    row.plannedMinutes += item.actualMinutes;
    row.actualMinutes += item.actualMinutes;
    row.count += 1;
  }

  for (const item of interruptions) {
    if (item.actualMinutes <= 0) continue;
    const row = rowFor(item.title);
    row.unplannedMinutes += item.actualMinutes;
    row.actualMinutes += item.actualMinutes;
    row.count += 1;
  }

  const sorted = [...byTitle.values()].sort(
    (a, b) =>
      b.actualMinutes - a.actualMinutes || a.title.localeCompare(b.title),
  );
  const totalMinutes = sorted.reduce((sum, row) => sum + row.actualMinutes, 0);

  // 畳む対象が1件しかないときは丸めない(「その他(1件)」は情報の劣化でしかない)
  const rows =
    sorted.length > limit + 1 ? foldTail(sorted, limit) : [...sorted];
  const otherCount = rows.at(-1)?.isOther ? (rows.at(-1)?.count ?? 0) : 0;

  return {
    rows,
    totalMinutes,
    // 「その他」が最大になることがあるため、必ず丸め込み後の行から取る。
    // 丸め込み前の値を使うと棒の幅が100%を超える
    maxMinutes: rows.reduce((max, row) => Math.max(max, row.actualMinutes), 0),
    otherCount,
  };
}

/** 上位 limit 件を残し、残りを「その他」1行に畳む。「その他」は常に末尾 */
function foldTail(
  sorted: ActualBreakdownRow[],
  limit: number,
): ActualBreakdownRow[] {
  const head = sorted.slice(0, limit);
  const tail = sorted.slice(limit);
  const other = tail.reduce<ActualBreakdownRow>(
    (acc, row) => ({
      ...acc,
      actualMinutes: acc.actualMinutes + row.actualMinutes,
      plannedMinutes: acc.plannedMinutes + row.plannedMinutes,
      unplannedMinutes: acc.unplannedMinutes + row.unplannedMinutes,
      // 畳んだ「タイトル数」。行内の件数ではない
      count: acc.count + 1,
    }),
    {
      title: "",
      actualMinutes: 0,
      plannedMinutes: 0,
      unplannedMinutes: 0,
      count: 0,
      isOther: true,
    },
  );
  return [...head, other];
}
