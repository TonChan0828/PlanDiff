import {
  addDays,
  addMilliseconds,
  differenceInMilliseconds,
  parseISO,
} from "date-fns";

// フリー実績を「次回の予定」へ昇格する際のフォーム初期値(P2-6)。
// 開始=翌日の同時刻(ローカルTZ基準)、終了=開始+実績と同じ長さ。

export interface PromotionDefaults {
  title: string;
  /** UTCのISO文字列 */
  startAt: string;
  /** UTCのISO文字列 */
  endAt: string;
}

export function buildPromotionDefaults(entry: {
  title: string;
  startAt: string;
  endAt: string;
}): PromotionDefaults {
  const start = parseISO(entry.startAt);
  const end = parseISO(entry.endAt);
  const nextStart = addDays(start, 1);
  const nextEnd = addMilliseconds(
    nextStart,
    differenceInMilliseconds(end, start),
  );
  return {
    title: entry.title,
    startAt: nextStart.toISOString(),
    endAt: nextEnd.toISOString(),
  };
}
