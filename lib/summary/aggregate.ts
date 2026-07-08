import { differenceInMinutes, parseISO } from "date-fns";

// ギャップサマリー(P3-2)の集計。予定・実績とも「開始時刻が対象範囲内にあるもの」を
// 集計対象とする(範囲をまたぐ予定・実績は対象外。仕様書 docs/specs/P3-2_ギャップサマリー.md 参照)。

export interface SummaryRange {
  start: Date;
  end: Date; // 半開区間 [start, end)
}

export interface SummaryPlanEvent {
  googleEventId: string;
  title: string;
  /** UTCのISO文字列 */
  startAt: string;
  /** UTCのISO文字列 */
  endAt: string;
}

export interface SummaryActualEntry {
  id: string;
  title: string;
  googleEventId: string | null;
  /** UTCのISO文字列 */
  startAt: string;
  /** UTCのISO文字列 */
  endAt: string;
}

export interface GapSummaryItem {
  googleEventId: string;
  title: string;
  planMinutes: number;
  actualMinutes: number;
  gapMinutes: number;
  notStarted: boolean;
}

export interface InterruptionItem {
  id: string;
  title: string;
  actualMinutes: number;
}

export interface GapSummary {
  planTotalMinutes: number;
  actualTotalMinutes: number;
  gapMinutes: number;
  gapPercent: number | null;
  items: GapSummaryItem[];
  interruptions: InterruptionItem[];
}

function durationMinutes(startAt: string, endAt: string): number {
  return differenceInMinutes(parseISO(endAt), parseISO(startAt));
}

function inRange(startAt: string, range: SummaryRange): boolean {
  const start = parseISO(startAt);
  return start >= range.start && start < range.end;
}

export function computeGapSummary(
  planEvents: SummaryPlanEvent[],
  actualEntries: SummaryActualEntry[],
  range: SummaryRange,
): GapSummary {
  const plansInRange = planEvents.filter((event) =>
    inRange(event.startAt, range),
  );
  const actualsInRange = actualEntries.filter((entry) =>
    inRange(entry.startAt, range),
  );

  const planByEventId = new Map(
    plansInRange.map((event) => [event.googleEventId, event]),
  );
  const actualMinutesByEventId = new Map<string, number>();
  const interruptions: InterruptionItem[] = [];

  for (const entry of actualsInRange) {
    const plan = entry.googleEventId
      ? planByEventId.get(entry.googleEventId)
      : undefined;
    if (!plan) {
      interruptions.push({
        id: entry.id,
        title: entry.title,
        actualMinutes: durationMinutes(entry.startAt, entry.endAt),
      });
      continue;
    }
    const current = actualMinutesByEventId.get(entry.googleEventId!) ?? 0;
    actualMinutesByEventId.set(
      entry.googleEventId!,
      current + durationMinutes(entry.startAt, entry.endAt),
    );
  }

  const items: GapSummaryItem[] = plansInRange.map((event) => {
    const planMinutes = durationMinutes(event.startAt, event.endAt);
    const actualMinutes = actualMinutesByEventId.get(event.googleEventId) ?? 0;
    return {
      googleEventId: event.googleEventId,
      title: event.title,
      planMinutes,
      actualMinutes,
      gapMinutes: actualMinutes - planMinutes,
      notStarted: actualMinutes === 0,
    };
  });

  const planTotalMinutes = items.reduce(
    (sum, item) => sum + item.planMinutes,
    0,
  );
  const actualTotalMinutes =
    items.reduce((sum, item) => sum + item.actualMinutes, 0) +
    interruptions.reduce((sum, item) => sum + item.actualMinutes, 0);
  const gapMinutes = actualTotalMinutes - planTotalMinutes;
  const gapPercent =
    planTotalMinutes === 0
      ? null
      : Math.round((gapMinutes / planTotalMinutes) * 100);

  return {
    planTotalMinutes,
    actualTotalMinutes,
    gapMinutes,
    gapPercent,
    items,
    interruptions,
  };
}
