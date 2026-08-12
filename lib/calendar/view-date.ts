import {
  addDays,
  format,
  isSameDay,
  isValid,
  parse,
  startOfDay,
  startOfWeek,
} from "date-fns";

// カレンダービュー(P2-1)の表示状態計算。純粋な日付計算のみで、
// 週境界はユーザーのタイムゾーンに依存するためクライアント/サーバー共用にする
// (sync-range.ts と同じ方針で "server-only" を付けない)。

export type CalendarViewMode = "day" | "week";

export interface CalendarViewState {
  view: CalendarViewMode;
  /** 選択日のローカル0時 */
  date: Date;
}

const DATE_PARAM_FORMAT = "yyyy-MM-dd";

export function toDateParam(date: Date): string {
  return format(date, DATE_PARAM_FORMAT);
}

/**
 * `yyyy-MM-dd` として妥当な場合のみローカル0時のDateを返す。
 * `referenceZero` を渡すと、そのタイムゾーンの暦日として解釈する(P8-3)。
 * 省略時は `new Date(0)`(実行環境のローカルTZ)で従来どおり動作する
 */
export function parseDateParam(
  dateParam: string | undefined,
  referenceZero: Date = new Date(0),
): Date | null {
  if (!dateParam) {
    return null;
  }
  const parsed = parse(dateParam, DATE_PARAM_FORMAT, referenceZero);
  // 往復変換の一致で「2026-02-30」のような繰り上がりも弾く
  if (!isValid(parsed) || toDateParam(parsed) !== dateParam) {
    return null;
  }
  return startOfDay(parsed);
}

/** 不正・省略されたパラメータは「日ビュー・今日」にフォールバックする */
export function parseViewState(
  viewParam: string | undefined,
  dateParam: string | undefined,
  today: Date,
): CalendarViewState {
  return {
    view: viewParam === "week" ? "week" : "day",
    date: parseDateParam(dateParam) ?? startOfDay(today),
  };
}

/** 選択日を含む週(月曜始まり)の7日 */
export function weekDaysOf(date: Date): Date[] {
  const weekStart = startOfWeek(date, { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

/** ナビゲーション先(日ビュー=±1日、週ビュー=±7日) */
export function shiftDate(
  view: CalendarViewMode,
  date: Date,
  direction: "prev" | "next",
): Date {
  const step = view === "week" ? 7 : 1;
  return addDays(date, direction === "next" ? step : -step);
}

/**
 * カレンダーのURLを組み立てる。
 *
 * 「dateパラメータは今日以外を見ているときだけ持つ」という不変条件を守る(P8-1)。
 * 今日にdateを付けてしまうと、深夜0時をまたいでもURLが前日を指し続け、
 * 表示が翌日へ自動追従できなくなるため。
 * today が null(ハイドレーション前)のときは判定できないので常に付ける。
 */
export function buildCalendarPath(
  view: CalendarViewMode,
  date: Date,
  today: Date | null,
): string {
  if (today && isSameDay(date, today)) {
    return `/calendar?view=${view}`;
  }
  return `/calendar?view=${view}&date=${toDateParam(date)}`;
}
