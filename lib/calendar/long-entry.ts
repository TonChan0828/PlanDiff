import {
  addDays,
  addHours,
  differenceInMinutes,
  parseISO,
  startOfDay,
} from "date-fns";

// 週表示の長時間実績の省略(G-104)。仕様書: docs/specs/G-104_週表示の長時間実績の省略表示.md
// 元の開始・終了は書き換えず、配置にだけ使う範囲(layoutStartAt / layoutEndAt)を足す。
// 元の値は、ズレの計算・読み上げ・編集パネルがそのまま使う。

/** この長さ以上の完了した実績を、週表示で省略する */
export const LONG_ENTRY_DISPLAY_THRESHOLD_HOURS = 8;
/** 省略した実績の表示の長さ(開始から) */
export const LONG_ENTRY_DISPLAY_HOURS = 2;

/** head: 開始から2時間ぶんを描くブロック / continuation: 続きの日に出す印 */
export type LongEntryPart = "head" | "continuation";

export interface LongEntryDisplay {
  layoutStartAt?: string;
  layoutEndAt?: string;
  longEntry?: LongEntryPart;
}

export function capLongEntries<
  T extends { startAt: string; endAt: string; editable: boolean },
>(inputs: T[], day: Date): (T & LongEntryDisplay)[] {
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);
  return inputs.map((input) => {
    const start = parseISO(input.startAt);
    const end = parseISO(input.endAt);
    // 実行中(編集できない)は、伸びていることが分かるように省略しない
    if (
      !input.editable ||
      differenceInMinutes(end, start) < LONG_ENTRY_DISPLAY_THRESHOLD_HOURS * 60
    ) {
      return input;
    }
    const shownEnd = addHours(start, LONG_ENTRY_DISPLAY_HOURS);
    if (start < dayEnd && shownEnd > dayStart) {
      return {
        ...input,
        layoutEndAt: shownEnd.toISOString(),
        longEntry: "head" as const,
      };
    }
    // 表示ぶんより後の日で、実績がまだ続いている場合は、0時に最小の高さの印を置く
    if (start < dayStart && end > dayStart) {
      return {
        ...input,
        layoutStartAt: dayStart.toISOString(),
        layoutEndAt: dayStart.toISOString(),
        longEntry: "continuation" as const,
      };
    }
    return input;
  });
}
