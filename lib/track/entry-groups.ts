import { format, isSameDay, parseISO, startOfDay } from "date-fns";
import type { TimeEntryItem } from "@/lib/timer/types";

// 計測画面「実績」リストの日付グループ化(P2-6 拡張 2026-07-20)。
// 実行環境(クライアント)のローカルTZで確定済み実績を暦日ごとにまとめる。
// - 未来日(暦日 > 今日)は除外する
// - グループは日付の新しい順、各グループ内は開始降順
// ラベルの文言整形はロケール非依存を保つためUI側に委ね、ここでは日付情報のみ返す。

export interface EntryDayGroup {
  /** ローカル暦日キー(例 "2026-07-11") */
  key: string;
  /** その日の startOfDay(ラベル整形用) */
  date: Date;
  /** ローカルTZで「今日」に属するか */
  isToday: boolean;
  /** その日の実績(開始降順) */
  entries: TimeEntryItem[];
}

export function groupEntriesByDay(
  entries: TimeEntryItem[],
  now: Date,
): EntryDayGroup[] {
  const today = startOfDay(now);
  const buckets = new Map<string, TimeEntryItem[]>();

  for (const entry of entries) {
    const start = parseISO(entry.startAt);
    const day = startOfDay(start);
    // 未来日は表示しない(取得範囲に混じり得るため念のため除外)
    if (day.getTime() > today.getTime()) {
      continue;
    }
    const key = format(day, "yyyy-MM-dd");
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(entry);
    } else {
      buckets.set(key, [entry]);
    }
  }

  return Array.from(buckets.entries())
    .map(([key, groupEntries]) => {
      const date = startOfDay(parseISO(groupEntries[0]!.startAt));
      return {
        key,
        date,
        isToday: isSameDay(date, now),
        entries: groupEntries.sort(
          (a, b) =>
            parseISO(b.startAt).getTime() - parseISO(a.startAt).getTime(),
        ),
      };
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}
