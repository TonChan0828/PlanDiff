import { differenceInMinutes, parseISO } from "date-fns";

// 止め忘れの可能性の判定(G-91)。仕様書: docs/specs/G-91_タイマーの止め忘れ対策.md
// 現在時刻は引数で受け取る純粋関数。知らせるだけで、自動で停止・修正はしない(P13-1 の方針)。

/** この長さ以上の計測を「止め忘れの可能性がある」とする */
export const LONG_ENTRY_HOURS = 6;
/** 予定の終了をこの分数以上過ぎた実行中タイマーを知らせる(直後の少しの超過では出さない) */
export const PLAN_OVERRUN_WARNING_MINUTES = 15;

interface PlanTimes {
  /** UTCのISO文字列 */
  startAt: string;
  /** UTCのISO文字列 */
  endAt: string;
}

/** 開始から終了(実行中は現在)までが閾値以上か。不正な日時は false(NaN との比較は false) */
export function isLongDuration(startAt: string, endAt: string): boolean {
  return (
    differenceInMinutes(parseISO(endAt), parseISO(startAt)) >=
    LONG_ENTRY_HOURS * 60
  );
}

export function isPlanOverrun(
  plan: PlanTimes | undefined,
  nowIso: string,
): boolean {
  if (!plan) return false;
  return (
    differenceInMinutes(parseISO(nowIso), parseISO(plan.endAt)) >=
    PLAN_OVERRUN_WARNING_MINUTES
  );
}

/**
 * 終了時刻の修正候補。予定の終了が実績の開始より後で、終了より前のときだけ返す。
 * 根拠のない時刻は提案しないため、予定がなければ null。
 */
export function suggestedEndAt(
  entry: PlanTimes,
  plan: PlanTimes | undefined,
): string | null {
  if (!plan) return null;
  const planEnd = Date.parse(plan.endAt);
  return Date.parse(entry.startAt) < planEnd &&
    planEnd < Date.parse(entry.endAt)
    ? plan.endAt
    : null;
}
