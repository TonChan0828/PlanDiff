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

export function computeSyncRange(displayedDate: Date): SyncRange {
  const weekStart = startOfWeek(displayedDate, { weekStartsOn: 1 });
  return {
    timeMin: addDays(weekStart, -7).toISOString(),
    timeMax: addDays(weekStart, 14).toISOString(),
  };
}
