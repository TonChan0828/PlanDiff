import { parseISO } from "date-fns";
import type { CalendarBlockInput } from "@/lib/calendar/layout";
import type { RunningEntry, TimeEntryItem } from "@/lib/timer/types";

// 実績エントリ(確定+実行中)を右レーン用のブロック入力へ変換する(P2-2)。
// 配置計算はP2-1の layoutDayEvents をそのまま使う。

export function actualBlockInputs(
  entries: TimeEntryItem[],
  running: RunningEntry | null,
  now: Date,
): CalendarBlockInput[] {
  const inputs: CalendarBlockInput[] = entries.map((entry) => ({
    id: entry.id,
    title: entry.title,
    startAt: entry.startAt,
    endAt: entry.endAt,
  }));
  if (running) {
    // 実行中は start〜現在時刻。時計のズレで now が開始より前なら開始時刻に丸める
    const endAt =
      now.getTime() < parseISO(running.startAt).getTime()
        ? running.startAt
        : now.toISOString();
    inputs.push({
      id: running.id,
      title: running.title,
      startAt: running.startAt,
      endAt,
    });
  }
  return inputs;
}
