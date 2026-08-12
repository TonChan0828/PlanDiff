import { TZDate } from "@date-fns/tz";

// サーバーは訪問者のタイムゾーンを知る手段がないため、Cookie経由で受け取った
// IANAタイムゾーン名から「訪問者のTZでの現在時刻」を組み立てる(P8-3)。
// TZDateは date-fns v4 の startOfDay/startOfWeek/addWeeks/addMonths/parse
// 等を通してもタイムゾーンを保持したまま計算できる(プロセスのTZ環境変数に依存しない)。

/**
 * timezone が null ならそのまま base を返す。
 * 存在しないタイムゾーン名は例外を投げず base にフォールバックする
 * (不正なCookie値でSSRを落とさないため)。
 * TZDateは不正なタイムゾーン名を渡しても例外を投げず Invalid Date になるだけなので、
 * getTime() のNaN判定で明示的に弾く。
 */
export function resolveNowInTimezone(
  timezone: string | null,
  base: Date = new Date(),
): Date {
  if (timezone === null) {
    return base;
  }
  try {
    const result = new TZDate(base, timezone);
    return Number.isNaN(result.getTime()) ? base : result;
  } catch {
    return base;
  }
}
