import { isSameDay, parseISO } from "date-fns";

// 計測画面「今の予定から開始」の候補抽出(P2-6)。
// 進行中(startAt <= now < endAt)を先頭に、以降は当日内でこれから始まる予定を
// 開始昇順で並べ、合計最大 QUICK_START_LIMIT 件を返す。
// 「当日」の判定は実行環境(クライアント)のローカルTZで行う。

export interface QuickStartEvent {
  id: string;
  /** タイマー(time_entries)と紐づく予定キー(Google予定ID or "app:<uuid>") */
  googleEventId: string;
  title: string;
  /** UTCのISO文字列 */
  startAt: string;
  /** UTCのISO文字列 */
  endAt: string;
}

export const QUICK_START_LIMIT = 3;

export function selectQuickStartEvents<T extends QuickStartEvent>(
  events: T[],
  now: Date,
): T[] {
  const nowMs = now.getTime();
  const byStartAsc = (a: T, b: T) =>
    parseISO(a.startAt).getTime() - parseISO(b.startAt).getTime();

  const ongoing = events
    .filter((event) => {
      const startMs = parseISO(event.startAt).getTime();
      const endMs = parseISO(event.endAt).getTime();
      return startMs <= nowMs && nowMs < endMs;
    })
    .sort(byStartAsc);

  const upcoming = events
    .filter((event) => {
      const start = parseISO(event.startAt);
      return start.getTime() > nowMs && isSameDay(start, now);
    })
    .sort(byStartAsc);

  return [...ongoing, ...upcoming].slice(0, QUICK_START_LIMIT);
}
