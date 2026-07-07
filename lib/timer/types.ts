// タイマー関連の共有型(P2-2)。クライアント/サーバー両方から参照する。

export interface TimeEntryItem {
  id: string;
  title: string;
  /** UTCのISO文字列 */
  startAt: string;
  /** UTCのISO文字列 */
  endAt: string;
}

export interface RunningEntry {
  id: string;
  title: string;
  /** フリータイマー(P2-3)は null */
  googleEventId: string | null;
  /** UTCのISO文字列 */
  startAt: string;
}
