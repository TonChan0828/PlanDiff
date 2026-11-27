import { TZDate } from "@date-fns/tz";
import {
  RECURRING_ID_PREFIX,
  type RecurringPattern,
} from "@/lib/calendar/recurring-id";

// 予定の時間の重なりの判定(G-94)。仕様書: docs/specs/G-94_予定の時間の重なりの警告.md
// 区間は半開区間 [start, end)。終了と開始が同じ時刻は重ならない。クライアントから使う純粋関数。

export interface OverlapCandidate {
  id: string;
  googleEventId?: string;
  title: string;
  /** UTCのISO文字列 */
  startAt: string;
  /** UTCのISO文字列 */
  endAt: string;
}

export interface RecurringOverlapRule {
  pattern: RecurringPattern;
  weekdays: number[] | null;
  /** "HH:mm" */
  startTime: string;
  /** "HH:mm" */
  endTime: string;
  /** この日以降("YYYY-MM-DD")の回を調べる */
  startsOn: string;
  endsOn: string | null;
}

const sortByStart = <T extends OverlapCandidate>(events: T[]) =>
  [...events].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));

const intersects = (startMs: number, endMs: number, event: OverlapCandidate) =>
  startMs < Date.parse(event.endAt) && Date.parse(event.startAt) < endMs;

export function findOverlappingEvents<T extends OverlapCandidate>(
  events: T[],
  range: { startAt: string; endAt: string },
  excludeId?: string,
): T[] {
  const startMs = Date.parse(range.startAt);
  const endMs = Date.parse(range.endAt);
  // 入力が未完成・不正な間は何も返さない(NaN との比較は false)
  if (!(startMs < endMs)) {
    return [];
  }
  return sortByStart(
    events.filter(
      (event) => event.id !== excludeId && intersects(startMs, endMs, event),
    ),
  );
}

function coversWeekday(rule: RecurringOverlapRule, weekday: number): boolean {
  if (rule.pattern === "daily") return true;
  if (rule.pattern === "weekdays") return weekday >= 1 && weekday <= 5;
  return (rule.weekdays ?? []).includes(weekday);
}

/** 1件の予定が日をまたぐ上限。壊れたデータで走査が長くならないようにする */
const MAX_DAYS_PER_EVENT = 60;

/**
 * 定期予定の回と重なる既存の予定。予定がかかる日ごとに、その日の回の時間帯を作って比べる。
 * timeZone はルールの時刻を解釈するタイムゾーン。excludeRuleId のルールの回は除く。
 */
export function findRecurringOverlaps<T extends OverlapCandidate>(
  events: T[],
  rule: RecurringOverlapRule,
  timeZone: string,
  excludeRuleId?: string,
): T[] {
  if (!rule.startTime || !rule.endTime || rule.startTime >= rule.endTime) {
    return [];
  }
  const [startHour = 0, startMinute = 0] = rule.startTime
    .split(":")
    .map(Number);
  const [endHour = 0, endMinute = 0] = rule.endTime.split(":").map(Number);
  const ownPrefix = excludeRuleId
    ? `${RECURRING_ID_PREFIX}${excludeRuleId}:`
    : null;

  return sortByStart(
    events.filter((event) => {
      if (ownPrefix && event.googleEventId?.startsWith(ownPrefix)) {
        return false;
      }
      const eventStart = new TZDate(Date.parse(event.startAt), timeZone);
      const eventEndMs = Date.parse(event.endAt);
      const year = eventStart.getFullYear();
      const month = eventStart.getMonth();
      const firstDay = eventStart.getDate();
      for (let offset = 0; offset < MAX_DAYS_PER_EVENT; offset += 1) {
        const day = new TZDate(year, month, firstDay + offset, 0, 0, timeZone);
        if (day.getTime() >= eventEndMs) break;
        const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
        if (
          date < rule.startsOn ||
          (rule.endsOn && date > rule.endsOn) ||
          !coversWeekday(rule, day.getDay())
        ) {
          continue;
        }
        const at = (hour: number, minute: number) =>
          new TZDate(
            day.getFullYear(),
            day.getMonth(),
            day.getDate(),
            hour,
            minute,
            timeZone,
          ).getTime();
        if (
          intersects(at(startHour, startMinute), at(endHour, endMinute), event)
        ) {
          return true;
        }
      }
      return false;
    }),
  );
}
