// 定期予定(P5-1)のクライアント/サーバー共有の定義。"server-only" を持たないため、
// components/calendar-view.tsx 等のクライアントコンポーネントからも安全にimportできる
// (lib/calendar/recurring.ts はサーバー専用なのでクライアントからimportしてはいけない)。

export const RECURRING_ID_PREFIX = "rec:";

export function isRecurringEventId(googleEventId: string): boolean {
  return googleEventId.startsWith(RECURRING_ID_PREFIX);
}

const OCCURRENCE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** google_event_id("rec:<ruleId>:<occurrenceDate>")の解析。非対象なら null */
export function parseRecurringEventId(
  googleEventId: string,
): { ruleId: string; occurrenceDate: string } | null {
  if (!isRecurringEventId(googleEventId)) {
    return null;
  }
  const rest = googleEventId.slice(RECURRING_ID_PREFIX.length);
  const separatorIndex = rest.lastIndexOf(":");
  if (separatorIndex === -1) {
    return null;
  }
  const ruleId = rest.slice(0, separatorIndex);
  const occurrenceDate = rest.slice(separatorIndex + 1);
  if (!ruleId || !OCCURRENCE_DATE_PATTERN.test(occurrenceDate)) {
    return null;
  }
  return { ruleId, occurrenceDate };
}

export type RecurringPattern = "daily" | "weekly" | "weekdays";

export interface RecurringRuleSummary {
  id: string;
  title: string;
  pattern: RecurringPattern;
  weekdays: number[] | null;
  /** "HH:mm" 形式。ルールのtimezoneにおけるローカル時刻 */
  startTime: string;
  /** "HH:mm" 形式。ルールのtimezoneにおけるローカル時刻 */
  endTime: string;
  timezone: string;
  /** "YYYY-MM-DD" 形式 */
  startsOn: string;
  /** "YYYY-MM-DD" 形式。nullは無期限 */
  endsOn: string | null;
}
