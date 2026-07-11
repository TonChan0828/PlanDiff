import { isSameDay, parseISO } from "date-fns";
import type { TimeEntryItem } from "@/lib/timer/types";

// 計測画面「今日の実績」の抽出(P2-6)。
// 実行環境(クライアント)のローカルTZで「今日」に開始した確定済み実績を、開始降順で返す。

export function filterTodayEntries(
  entries: TimeEntryItem[],
  now: Date,
): TimeEntryItem[] {
  return entries
    .filter((entry) => isSameDay(parseISO(entry.startAt), now))
    .sort(
      (a, b) => parseISO(b.startAt).getTime() - parseISO(a.startAt).getTime(),
    );
}
