import { addDays, differenceInMinutes, parseISO, startOfDay } from "date-fns";

// 予定ブロックの配置計算(P2-1)。UTCのISO文字列を端末ローカルTZの日に対して
// 「0時からの経過分」に変換し、タイムライン上の位置(%)を返す純粋関数。

export interface CalendarBlockInput {
  id: string;
  title: string;
  /** UTCのISO文字列 */
  startAt: string;
  /** UTCのISO文字列 */
  endAt: string;
}

export interface CalendarBlockLayout {
  /** 日の高さに対する上端位置(0〜100%) */
  topPercent: number;
  /** 日の高さに対する高さ(0〜100%) */
  heightPercent: number;
  /** 重複グループ内の列(0始まり) */
  column: number;
  /** 重複グループの総列数 */
  columnCount: number;
  /** 前日から続く予定(上端がクリップ済み) */
  clippedStart: boolean;
  /** 翌日へ続く予定(下端がクリップ済み) */
  clippedEnd: boolean;
}

/** 入力の追加フィールド(googleEventId等)は配置結果にそのまま引き継がれる */
export type CalendarBlock<T extends CalendarBlockInput = CalendarBlockInput> =
  T & CalendarBlockLayout;

/** 極短予定でも視認・(P2-2で)タップ可能な最小高さ(分換算) */
export const MIN_BLOCK_MINUTES = 24;

const DAY_MINUTES = 24 * 60;

interface WorkItem<T extends CalendarBlockInput> {
  input: T;
  top: number;
  bottom: number;
  clippedStart: boolean;
  clippedEnd: boolean;
  column: number;
  columnCount: number;
}

export function layoutDayEvents<T extends CalendarBlockInput>(
  events: T[],
  day: Date,
): CalendarBlock<T>[] {
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);

  const items: WorkItem<T>[] = [];
  for (const input of events) {
    const start = parseISO(input.startAt);
    const end = parseISO(input.endAt);
    const intersects =
      (start < dayEnd && end > dayStart) ||
      // 開始=終了の予定も、その時刻が日内なら表示する
      (start.getTime() === end.getTime() &&
        start >= dayStart &&
        start < dayEnd);
    if (!intersects) {
      continue;
    }

    const top = Math.max(0, differenceInMinutes(start, dayStart));
    const rawBottom = Math.min(DAY_MINUTES, differenceInMinutes(end, dayStart));
    // 最小高さを確保しつつ、24時を超える場合は上方向へ寄せる
    let bottom = Math.max(rawBottom, top + MIN_BLOCK_MINUTES);
    let adjustedTop = top;
    if (bottom > DAY_MINUTES) {
      bottom = DAY_MINUTES;
      adjustedTop = Math.min(adjustedTop, DAY_MINUTES - MIN_BLOCK_MINUTES);
    }

    items.push({
      input,
      top: adjustedTop,
      bottom,
      clippedStart: start < dayStart,
      clippedEnd: end > dayEnd,
      column: 0,
      columnCount: 1,
    });
  }

  // 上端昇順(同位置は長い方を先)で並べ、重複クラスタごとに空き列へ詰める
  items.sort(
    (a, b) =>
      a.top - b.top ||
      b.bottom - a.bottom ||
      a.input.id.localeCompare(b.input.id),
  );

  let cluster: WorkItem<T>[] = [];
  let clusterEnd = -1;
  const flushCluster = () => {
    if (cluster.length === 0) {
      return;
    }
    const columnCount = Math.max(...cluster.map((item) => item.column)) + 1;
    for (const item of cluster) {
      item.columnCount = columnCount;
    }
    cluster = [];
  };

  for (const item of items) {
    if (cluster.length > 0 && item.top >= clusterEnd) {
      flushCluster();
    }
    const usedColumns = new Set(
      cluster
        .filter((other) => other.bottom > item.top)
        .map((other) => other.column),
    );
    let column = 0;
    while (usedColumns.has(column)) {
      column += 1;
    }
    item.column = column;
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.bottom);
  }
  flushCluster();

  return items.map((item) => ({
    ...item.input,
    topPercent: (item.top / DAY_MINUTES) * 100,
    heightPercent: ((item.bottom - item.top) / DAY_MINUTES) * 100,
    column: item.column,
    columnCount: item.columnCount,
    clippedStart: item.clippedStart,
    clippedEnd: item.clippedEnd,
  }));
}
