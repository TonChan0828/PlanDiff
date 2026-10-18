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

/** ルールの由来(P10-1)。'suggestion' = 提案の「毎週にする」経由で作成 */
export type RecurringRuleOrigin = "manual" | "suggestion";

export interface RecurringRulePause {
  /** ルールのタイムゾーンでの開始日（含む）と終了日（含まない）。null は休止継続中 */
  startsOn: string;
  endsOn: string | null;
}

export interface RulePauseSuggestion {
  ruleId: string;
  title: string;
  missedCount: number;
  lastRecordedAt: string | null;
  timezone: string;
}

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
  origin: RecurringRuleOrigin;
  /** 学習補正(P10-1)の直近再計算日時。UTCのISO文字列。未学習は null */
  lastLearnedAt: string | null;
  /** 休止期間。旧呼び出し元との互換性のため省略時は休止なし */
  pauses?: RecurringRulePause[];
}

/** 提案経由の定期予定の自動調整(P10-1)。変更が実際にあった1件ぶんの通知データ */
export interface RuleAdjustmentNotice {
  sampleCount?: number;
  ruleId: string;
  title: string;
  timezone: string;
  /** "HH:mm" 形式 */
  previousStartTime: string;
  /** "HH:mm" 形式 */
  previousEndTime: string;
  /** "HH:mm" 形式 */
  newStartTime: string;
  /** "HH:mm" 形式 */
  newEndTime: string;
}

/** 休止予約も含む。再開予約日は、その日になるまで学習・休止提案を止める。 */
export function isRulePaused(rule: RecurringRuleSummary, now: Date): boolean {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: rule.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return (rule.pauses ?? []).some(
    (pause) => !pause.endsOn || pause.endsOn > date,
  );
}

export function isOccurrencePaused(
  rule: RecurringRuleSummary,
  date: string,
): boolean {
  return (rule.pauses ?? []).some(
    (pause) => date >= pause.startsOn && (!pause.endsOn || date < pause.endsOn),
  );
}
