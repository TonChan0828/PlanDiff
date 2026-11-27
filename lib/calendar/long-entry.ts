import {
  addDays,
  addHours,
  addMinutes,
  differenceInMinutes,
  min,
  parseISO,
  startOfDay,
  subMinutes,
} from "date-fns";

// 週表示の長時間実績の省略(G-104)。仕様書: docs/specs/G-104_週表示の長時間実績の省略表示.md
// 元の開始・終了は書き換えず、配置にだけ使う範囲(layoutStartAt / layoutEndAt)を足す。
// 元の値は、ズレの計算・読み上げ・編集パネルがそのまま使う。

/** この長さ以上の完了した実績を、週表示で省略する */
export const LONG_ENTRY_DISPLAY_THRESHOLD_HOURS = 8;
/** 省略した実績の表示の長さ(開始から) */
export const LONG_ENTRY_DISPLAY_HOURS = 2;
/** 0時の直前に始まる本体の最小の高さ(分換算)。これ未満だとタイトルと「省略 …」が読めない */
const HEAD_MIN_MINUTES = 90;
/** 続きの日の印の高さ(分換算)。週表示の細い列で「前日から継続(省略)」が3行になっても収まる */
const CONTINUATION_MINUTES = 45;

/** head: 開始日に、開始から2時間ぶん(0時まで)を描くブロック / continuation: 続きの日に出す印 */
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
    // 本体は開始日の列だけに出す。2時間が0時を超える分は翌日に分けず、0時で切る
    if (start >= dayStart && start < dayEnd) {
      const shownEnd = min([addHours(start, LONG_ENTRY_DISPLAY_HOURS), dayEnd]);
      const tooShort = differenceInMinutes(shownEnd, start) < HEAD_MIN_MINUTES;
      return {
        ...input,
        // 0時の直前に始まると低くなりすぎるため、上に広げて読める高さにする(実際の時刻は変えない)
        ...(tooShort
          ? {
              layoutStartAt: subMinutes(
                shownEnd,
                HEAD_MIN_MINUTES,
              ).toISOString(),
            }
          : {}),
        layoutEndAt: shownEnd.toISOString(),
        longEntry: "head" as const,
      };
    }
    // 開始日より後で実績が続いている日は、0時に続きの印を置く
    if (start < dayStart && end > dayStart) {
      return {
        ...input,
        layoutStartAt: dayStart.toISOString(),
        layoutEndAt: addMinutes(dayStart, CONTINUATION_MINUTES).toISOString(),
        longEntry: "continuation" as const,
      };
    }
    return input;
  });
}
