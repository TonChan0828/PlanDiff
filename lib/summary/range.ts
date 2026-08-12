import { TZDate } from "@date-fns/tz";
import {
  addDays,
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { parseDateParam, toDateParam } from "@/lib/calendar/view-date";
import type { SyncRange } from "@/lib/google/sync-range";
import type { SummaryRange } from "@/lib/summary/aggregate";

// サマリーの任意期間表示(P5-9)の期間解決。仕様書: docs/specs/P5-9_サマリーの任意期間表示.md
// 週・月の境界はユーザーのタイムゾーンに依存するためクライアント/サーバー共用にする
// (lib/calendar/view-date.ts と同じ方針で "server-only" を付けない)。

export type SummaryRangeKey = "today" | "week" | "month" | "custom";

/** 集計できる期間の上限(日数)。超過時は集計せずエラー文言を出す */
export const MAX_RANGE_DAYS = 366;

export interface SummaryRangeParams {
  range?: string;
  date?: string;
  from?: string;
  to?: string;
}

export interface ResolvedSummaryRange {
  key: SummaryRangeKey;
  /** 集計期間。半開区間 [start, end) */
  range: SummaryRange;
  /** today/week/month の基準日(ローカル0時)。前後移動の起点になる */
  anchorDate: Date;
  /** 期間の初日(ローカル0時)。カスタムフォームの初期値に使う */
  from: Date;
  /** 期間の最終日(ローカル0時。終了日を含む) */
  to: Date;
  dayCount: number;
  /** 上限超過。null なら集計可能 */
  error: "too-long" | null;
}

function parseRangeKey(range: string | undefined): SummaryRangeKey {
  if (range === "week" || range === "month" || range === "custom") {
    return range;
  }
  return "today";
}

function build(
  key: SummaryRangeKey,
  anchorDate: Date,
  start: Date,
  end: Date,
): ResolvedSummaryRange {
  const dayCount = differenceInCalendarDays(end, start);
  return {
    key,
    range: { start, end },
    anchorDate,
    from: start,
    to: addDays(end, -1),
    dayCount,
    error: dayCount > MAX_RANGE_DAYS ? "too-long" : null,
  };
}

function resolvePreset(
  key: Exclude<SummaryRangeKey, "custom">,
  anchorDate: Date,
): ResolvedSummaryRange {
  if (key === "week") {
    const start = startOfWeek(anchorDate, { weekStartsOn: 1 });
    return build(key, anchorDate, start, addWeeks(start, 1));
  }
  if (key === "month") {
    const start = startOfMonth(anchorDate);
    return build(key, anchorDate, start, addMonths(start, 1));
  }
  return build(key, anchorDate, anchorDate, addDays(anchorDate, 1));
}

/**
 * URLのクエリパラメータから集計期間を決める。
 * 不正なパラメータはエラーにせず today へフォールバックする
 * (lib/calendar/view-date.ts の parseViewState と同じ思想)。
 * 上限超過だけは黙って丸めず error を立てて呼び出し側に判断させる。
 */
export function resolveSummaryRange(
  params: SummaryRangeParams,
  now: Date,
): ResolvedSummaryRange {
  const key = parseRangeKey(params.range);
  const today = startOfDay(now);
  // nowがTZDate(P8-3。クライアントのタイムゾーンCookieから組み立てたもの)なら、
  // date/from/toのURLパラメータも同じタイムゾーンの暦日として解釈する。
  // 通常のDateなら従来どおり実行環境のローカルTZで解釈する(完全後方互換)
  const referenceZero =
    now instanceof TZDate ? new TZDate(0, now.timeZone) : new Date(0);

  if (key === "custom") {
    const from = parseDateParam(params.from, referenceZero);
    const to = parseDateParam(params.to, referenceZero);
    if (!from || !to || to < from) {
      return resolvePreset("today", today);
    }
    return build("custom", from, from, addDays(to, 1));
  }

  return resolvePreset(
    key,
    parseDateParam(params.date, referenceZero) ?? today,
  );
}

/** 集計期間(ローカル日付境界)をDBクエリ用のUTC ISO範囲に変換する */
export function toSyncRange(range: SummaryRange): SyncRange {
  return {
    timeMin: range.start.toISOString(),
    timeMax: range.end.toISOString(),
  };
}

/** 前後移動の基準日(today=±1日 / week=±7日 / month=±1ヶ月) */
export function shiftAnchorDate(
  key: SummaryRangeKey,
  anchorDate: Date,
  direction: "prev" | "next",
): Date {
  const sign = direction === "next" ? 1 : -1;
  if (key === "month") {
    return addMonths(anchorDate, sign);
  }
  return addDays(anchorDate, key === "week" ? sign * 7 : sign);
}

export function buildSummaryPath(
  key: SummaryRangeKey,
  params: { anchorDate?: Date; from?: Date; to?: Date },
): string {
  if (key === "custom") {
    const from = params.from ? toDateParam(params.from) : "";
    const to = params.to ? toDateParam(params.to) : "";
    return `/summary?range=custom&from=${from}&to=${to}`;
  }
  const anchor = params.anchorDate ?? new Date();
  return `/summary?range=${key}&date=${toDateParam(anchor)}`;
}
