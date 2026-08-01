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
  /** 予定に対するズレの割合(%)。planMinutes===0 のときは算出不能で null(P5-8) */
  gapPercent: number | null;
  /**
   * 予定開始に対する実着手の遅れ(分)。正=遅れ・負=早着手・0=定刻。
   * 未着手(actualMinutes===0)のときは null(P5-8)
   */
  startDelayMinutes: number | null;
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
  planCount: number;
  startedCount: number;
  notStartedCount: number;
  interruptionCount: number;
  interruptionTotalMinutes: number;
  items: GapSummaryItem[];
  interruptions: InterruptionItem[];
}

/** 2日以上の期間で同タイトルをまとめた内訳(P5-9) */
export interface GroupedGapSummaryItem {
  title: string;
  /** その期間に含まれる同タイトルの予定件数 */
  count: number;
  planMinutes: number;
  actualMinutes: number;
  gapMinutes: number;
  /** 合計値から再計算する。planMinutes===0 のときは算出不能で null */
  gapPercent: number | null;
  /** 着手済み(startDelayMinutes が非null)の予定のみの平均。全件未着手なら null */
  averageStartDelayMinutes: number | null;
  notStartedCount: number;
}

/** 2日以上の期間で同タイトルをまとめた割り込み(P5-9) */
export interface GroupedInterruptionItem {
  title: string;
  count: number;
  actualMinutes: number;
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
  // 予定ごとの「最早の実績開始時刻」(ISO文字列)。開始遅延の算出に使う(P5-8)
  const earliestActualStartByEventId = new Map<string, string>();
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
    const eventId = entry.googleEventId!;
    const current = actualMinutesByEventId.get(eventId) ?? 0;
    actualMinutesByEventId.set(
      eventId,
      current + durationMinutes(entry.startAt, entry.endAt),
    );
    const earliest = earliestActualStartByEventId.get(eventId);
    if (earliest === undefined || entry.startAt < earliest) {
      earliestActualStartByEventId.set(eventId, entry.startAt);
    }
  }

  const items: GapSummaryItem[] = plansInRange.map((event) => {
    const planMinutes = durationMinutes(event.startAt, event.endAt);
    const actualMinutes = actualMinutesByEventId.get(event.googleEventId) ?? 0;
    const gapMinutes = actualMinutes - planMinutes;
    const earliestActualStart = earliestActualStartByEventId.get(
      event.googleEventId,
    );
    return {
      googleEventId: event.googleEventId,
      title: event.title,
      planMinutes,
      actualMinutes,
      gapMinutes,
      gapPercent:
        planMinutes === 0 ? null : Math.round((gapMinutes / planMinutes) * 100),
      startDelayMinutes:
        earliestActualStart === undefined
          ? null
          : differenceInMinutes(
              parseISO(earliestActualStart),
              parseISO(event.startAt),
            ),
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
  const notStartedCount = items.filter((item) => item.notStarted).length;

  return {
    planTotalMinutes,
    actualTotalMinutes,
    gapMinutes,
    gapPercent,
    planCount: items.length,
    startedCount: items.length - notStartedCount,
    notStartedCount,
    interruptionCount: interruptions.length,
    interruptionTotalMinutes: interruptions.reduce(
      (sum, item) => sum + item.actualMinutes,
      0,
    ),
    items,
    interruptions,
  };
}

/**
 * 予定ごとの内訳を同タイトルでまとめる(P5-9)。
 * 期間が2日以上のときに使い、単日では従来どおり1予定1行のまま表示する。
 * 並び順は |ズレ| 降順 → タイトル昇順。
 */
export function groupItemsByTitle(
  items: GapSummaryItem[],
): GroupedGapSummaryItem[] {
  const byTitle = new Map<
    string,
    GroupedGapSummaryItem & { delaySum: number; delayCount: number }
  >();

  for (const item of items) {
    const group = byTitle.get(item.title) ?? {
      title: item.title,
      count: 0,
      planMinutes: 0,
      actualMinutes: 0,
      gapMinutes: 0,
      gapPercent: null,
      averageStartDelayMinutes: null,
      notStartedCount: 0,
      delaySum: 0,
      delayCount: 0,
    };
    group.count += 1;
    group.planMinutes += item.planMinutes;
    group.actualMinutes += item.actualMinutes;
    group.gapMinutes += item.gapMinutes;
    if (item.notStarted) {
      group.notStartedCount += 1;
    }
    if (item.startDelayMinutes !== null) {
      group.delaySum += item.startDelayMinutes;
      group.delayCount += 1;
    }
    byTitle.set(item.title, group);
  }

  return [...byTitle.values()]
    .map(({ delaySum, delayCount, ...group }) => ({
      ...group,
      gapPercent:
        group.planMinutes === 0
          ? null
          : Math.round((group.gapMinutes / group.planMinutes) * 100),
      averageStartDelayMinutes:
        delayCount === 0 ? null : Math.round(delaySum / delayCount),
    }))
    .sort(
      (a, b) =>
        Math.abs(b.gapMinutes) - Math.abs(a.gapMinutes) ||
        a.title.localeCompare(b.title),
    );
}

/**
 * 割り込み・フリー作業を同タイトルでまとめる(P5-9)。
 * 並び順は合計時間の降順 → タイトル昇順。
 */
export function groupInterruptionsByTitle(
  interruptions: InterruptionItem[],
): GroupedInterruptionItem[] {
  const byTitle = new Map<string, GroupedInterruptionItem>();

  for (const item of interruptions) {
    const group = byTitle.get(item.title) ?? {
      title: item.title,
      count: 0,
      actualMinutes: 0,
    };
    group.count += 1;
    group.actualMinutes += item.actualMinutes;
    byTitle.set(item.title, group);
  }

  return [...byTitle.values()].sort(
    (a, b) =>
      b.actualMinutes - a.actualMinutes || a.title.localeCompare(b.title),
  );
}
