import { parseISO } from "date-fns";
import type { CalendarBlockInput } from "@/lib/calendar/layout";
import type { RunningEntry, TimeEntryItem } from "@/lib/timer/types";

// 実績エントリ(確定+実行中)を右レーン用のブロック入力へ変換する(P2-2)。
// 配置計算はP2-1の layoutDayEvents をそのまま使う。

/** editable: 確定済み(true)か実行中(false)か。実行中は手動編集の対象外(P2-4) */
export type ActualBlockInput = CalendarBlockInput & {
  editable: boolean;
  /** 紐づく予定のGoogle予定ID。フリータイマーはnull(P3-1) */
  googleEventId: string | null;
};

export function actualBlockInputs(
  entries: TimeEntryItem[],
  running: RunningEntry | null,
  now: Date,
): ActualBlockInput[] {
  const inputs: ActualBlockInput[] = entries.map((entry) => ({
    id: entry.id,
    title: entry.title,
    googleEventId: entry.googleEventId,
    startAt: entry.startAt,
    endAt: entry.endAt,
    editable: true,
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
      googleEventId: running.googleEventId,
      startAt: running.startAt,
      endAt,
      editable: false,
    });
  }
  return inputs;
}
