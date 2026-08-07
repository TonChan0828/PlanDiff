import { addDays, startOfWeek } from "date-fns";

// 「表示中の週 ± 1週間」(FR-02)の同期期間。週は月曜始まり。
// 週境界はユーザーのタイムゾーンに依存するためクライアント側で計算する。
// このモジュールは純粋な日付計算のみで秘匿情報を扱わないため "server-only" を付けない。

export interface SyncRange {
  /** UTCのISO文字列 */
  timeMin: string;
  /** UTCのISO文字列 */
  timeMax: string;
}

/**
 * 期間を Postgres の tstzrange リテラルへ変換する(P6-2)。
 * 下端を含み上端を含まない `[min,max)` で、従来の
 * `start_at < timeMax AND end_at > timeMin` と同じ境界の意味になる。
 */
export function toRangeLiteral(range: SyncRange): string {
  return `[${range.timeMin},${range.timeMax})`;
}

export function computeSyncRange(displayedDate: Date): SyncRange {
  const weekStart = startOfWeek(displayedDate, { weekStartsOn: 1 });
  return {
    timeMin: addDays(weekStart, -7).toISOString(),
    timeMax: addDays(weekStart, 14).toISOString(),
  };
}
