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

/** 開始・終了のISO文字列から継続分数を出す。グラフ集計(P7-1)と共用する */
export function durationMinutes(startAt: string, endAt: string): number {
  return differenceInMinutes(parseISO(endAt), parseISO(startAt));
}

/**
 * 「開始時刻が集計期間 [start, end) 内にあるか」を判定する。
 * 集計対象の定義そのものなので、グラフ集計(P7-1)もこれを共用して規則のズレを防ぐ。
 */
export function isStartInRange(startAt: string, range: SummaryRange): boolean {
  const start = parseISO(startAt);
  return start >= range.start && start < range.end;
}

/** 期間が進行中か(開始 ≤ asOf < 終了)。途中経過の表示を出すかの判定に使う(G-90) */
export function isPartialPeriod(range: SummaryRange, asOf: Date): boolean {
  return asOf >= range.start && asOf < range.end;
}

/**
 * 「経過した予定」だけを残す(G-90)。開始が asOf 以前、または紐づく実績が1件でもある予定。
 * 前倒しで着手した未来の予定を除くと、その実績が「割り込み」に化けて紐づきが消えるため、
 * 着手済みも含める。ヒーロー集計と日別グラフで共用し、両者の総和を一致させる。
 */
export function selectElapsedPlans(
  plansInRange: SummaryPlanEvent[],
  actualsInRange: SummaryActualEntry[],
  asOf: Date,
): SummaryPlanEvent[] {
  const startedEventIds = new Set(
    actualsInRange.flatMap((entry) =>
      entry.googleEventId ? [entry.googleEventId] : [],
    ),
  );
  return plansInRange.filter(
    (event) =>
      parseISO(event.startAt) <= asOf ||
      startedEventIds.has(event.googleEventId),
  );
}

/**
 * @param asOf 指定すると「ここまでの集計」になり、まだ始まっていない予定(未着手で開始が asOf より後)を
 *   計画・件数・内訳から除く。省略時は期間内の全予定を数える。
 */
export function computeGapSummary(
  planEvents: SummaryPlanEvent[],
  actualEntries: SummaryActualEntry[],
  range: SummaryRange,
  asOf?: Date,
): GapSummary {
  const actualsInRange = actualEntries.filter((entry) =>
    isStartInRange(entry.startAt, range),
  );
  const plansInPeriod = planEvents.filter((event) =>
    isStartInRange(event.startAt, range),
  );
  const plansInRange = asOf
    ? selectElapsedPlans(plansInPeriod, actualsInRange, asOf)
    : plansInPeriod;

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
