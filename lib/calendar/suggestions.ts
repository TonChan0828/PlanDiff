import { TZDate } from "@date-fns/tz";
import type { RecurringRuleSummary } from "@/lib/calendar/recurring-id";
import type { TimeEntryItem } from "@/lib/timer/types";

// 実績からの予定提案(P5-2)。仕様書: docs/specs/P5-2_実績からの予定提案.md
// computeSuggestions は純粋関数(DB非依存)。表示週の直前4週間の完了実績から
// 「同タイトル × 同曜日 × 開始時刻の差が60分以内」の繰り返しを検出し、
// 過去実績の中央値(15分単位丸め)で日時入りの提案を返す。
// 曜日・時刻の判定はユーザーのローカルタイムゾーンに依存するため、クライアント側で
// Intl.DateTimeFormat().resolvedOptions().timeZone を渡して実行する(P5-1と同方針)。
// このモジュールはクライアントからimportされるため "server-only" を付けない。

const LOOKBACK_DAYS = 28;
const CLUSTER_WINDOW_MINUTES = 60;
const MIN_OCCURRENCE_DAYS = 2;
const ROUND_UNIT_MINUTES = 15;
const MIN_DURATION_MINUTES = 15;
const MAX_SUGGESTIONS = 3;
const DAY_MINUTES = 24 * 60;

export interface PlanSuggestion {
  /** "タイトル|曜日"。セッション内の非表示管理に使う */
  key: string;
  title: string;
  /** 0=日〜6=土(JSのDate#getDayと一致) */
  weekday: number;
  /** 提案日 "YYYY-MM-DD"(表示週の該当日、ローカルTZ) */
  date: string;
  /** "HH:mm"(ローカルTZ) */
  startTime: string;
  /** "HH:mm"(ローカルTZ) */
  endTime: string;
  /** 直近4週での発生日数 */
  occurrenceCount: number;
}

/** 既存予定の重複判定に必要な最小形(SyncedEvent / CalendarViewEvent と構造互換) */
export interface SuggestionExistingEvent {
  title: string;
  /** UTCのISO文字列 */
  startAt: string;
}

export interface SuggestionInput {
  /** 完了済み実績(表示週開始前4週+TZバッファの範囲で取得したもの) */
  entries: TimeEntryItem[];
  /** 表示週の予定(±1週を含んでよい。表示週の該当日のみ重複判定に使う) */
  events: SuggestionExistingEvent[];
  recurringRules: RecurringRuleSummary[];
  /** 表示週の基準日 "YYYY-MM-DD" */
  viewDate: string;
  now: Date;
  /** IANAタイムゾーン名 */
  timeZone: string;
}

// TZDateのコピーコンストラクタはタイムゾーンを引き継がず実行環境のTZになるため、必ず明示して渡す
function addDaysTz(date: TZDate, days: number, timeZone: string): TZDate {
  const next = new TZDate(date.getTime(), timeZone);
  next.setDate(next.getDate() + days);
  return next;
}

function formatLocalDate(date: TZDate): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
}

function formatTime(totalMinutes: number): string {
  const hh = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const mm = String(totalMinutes % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** ソート済み数列の中央値(偶数件は中間2値の平均) */
function median(sortedValues: number[]): number {
  const mid = Math.floor(sortedValues.length / 2);
  if (sortedValues.length % 2 === 1) {
    return sortedValues[mid] ?? 0;
  }
  return ((sortedValues[mid - 1] ?? 0) + (sortedValues[mid] ?? 0)) / 2;
}

function roundToUnit(minutes: number): number {
  return Math.round(minutes / ROUND_UNIT_MINUTES) * ROUND_UNIT_MINUTES;
}

/** 定期ルールのパターンが曜日を含むか(daily=全曜日、weekdays=月〜金) */
function ruleCoversWeekday(
  rule: RecurringRuleSummary,
  weekday: number,
): boolean {
  switch (rule.pattern) {
    case "daily":
      return true;
    case "weekdays":
      return weekday >= 1 && weekday <= 5;
    case "weekly":
      return rule.weekdays?.includes(weekday) ?? false;
  }
}

interface ObservedEntry {
  /** ローカルTZでの発生日 "YYYY-MM-DD"(発生日数のカウント用) */
  dateKey: string;
  /** ローカルTZでの開始時刻(0:00からの分) */
  startMinutes: number;
  /** 実績時間(分) */
  durationMinutes: number;
}

export function computeSuggestions(input: SuggestionInput): PlanSuggestion[] {
  const { entries, events, recurringRules, viewDate, now, timeZone } = input;

  const [year, month, day] = viewDate.split("-").map(Number);
  const viewDayMidnight = new TZDate(
    year ?? 0,
    (month ?? 1) - 1,
    day ?? 1,
    0,
    0,
    0,
    timeZone,
  );
  // 週は月曜始まり(view-date.ts の weekDaysOf と同じ規約)
  const weekStart = addDaysTz(
    viewDayMidnight,
    -((viewDayMidnight.getDay() + 6) % 7),
    timeZone,
  );
  const weekEnd = addDaysTz(weekStart, 7, timeZone);

  // 過去週を表示中は提案しない
  if (weekEnd.getTime() <= now.getTime()) {
    return [];
  }

  const windowStartMs = addDaysTz(
    weekStart,
    -LOOKBACK_DAYS,
    timeZone,
  ).getTime();
  const weekStartMs = weekStart.getTime();

  // タイトル×曜日でグループ化(表示週開始前28日間の完了実績のみ)
  const groups = new Map<
    string,
    { title: string; weekday: number; observed: ObservedEntry[] }
  >();
  for (const item of entries) {
    const title = item.title.trim();
    if (title.length === 0) {
      continue;
    }
    const startMs = new Date(item.startAt).getTime();
    if (startMs < windowStartMs || startMs >= weekStartMs) {
      continue;
    }
    const local = new TZDate(startMs, timeZone);
    const weekday = local.getDay();
    const groupKey = `${title}|${weekday}`;
    const group = groups.get(groupKey) ?? { title, weekday, observed: [] };
    group.observed.push({
      dateKey: formatLocalDate(local),
      startMinutes: local.getHours() * 60 + local.getMinutes(),
      durationMinutes: (new Date(item.endAt).getTime() - startMs) / 60_000,
    });
    groups.set(groupKey, group);
  }

  // 重複判定用: 表示週の予定を「ローカル日付|タイトル」で索引化
  const eventDateTitles = new Set<string>();
  for (const event of events) {
    const local = new TZDate(new Date(event.startAt).getTime(), timeZone);
    eventDateTitles.add(`${formatLocalDate(local)}|${event.title.trim()}`);
  }

  const candidates: { suggestion: PlanSuggestion; startMs: number }[] = [];

  for (const { title, weekday, observed } of groups.values()) {
    // 開始時刻順に並べ、幅60分のスライディングウィンドウで発生日数最大のクラスタを取る
    const sorted = [...observed].sort(
      (a, b) => a.startMinutes - b.startMinutes,
    );
    let best: ObservedEntry[] = [];
    let bestDays = 0;
    for (let start = 0; start < sorted.length; start += 1) {
      let end = start;
      while (
        end + 1 < sorted.length &&
        (sorted[end + 1]?.startMinutes ?? 0) -
          (sorted[start]?.startMinutes ?? 0) <=
          CLUSTER_WINDOW_MINUTES
      ) {
        end += 1;
      }
      const cluster = sorted.slice(start, end + 1);
      const days = new Set(cluster.map((o) => o.dateKey)).size;
      if (days > bestDays) {
        best = cluster;
        bestDays = days;
      }
    }
    if (bestDays < MIN_OCCURRENCE_DAYS) {
      continue;
    }

    const startMinutes = roundToUnit(median(best.map((o) => o.startMinutes)));
    const durationMinutes = Math.max(
      MIN_DURATION_MINUTES,
      roundToUnit(
        median([...best.map((o) => o.durationMinutes)].sort((a, b) => a - b)),
      ),
    );
    const endMinutes = startMinutes + durationMinutes;
    // 日をまたぐ提案は出さない(FR-12の定期予定が日またぎ不可のため)
    if (endMinutes > DAY_MINUTES) {
      continue;
    }

    const proposalDay = addDaysTz(weekStart, (weekday + 6) % 7, timeZone);
    const proposalDate = formatLocalDate(proposalDay);
    const proposalStart = new TZDate(
      proposalDay.getFullYear(),
      proposalDay.getMonth(),
      proposalDay.getDate(),
      Math.floor(startMinutes / 60),
      startMinutes % 60,
      0,
      timeZone,
    );
    if (proposalStart.getTime() < now.getTime()) {
      continue;
    }
    if (eventDateTitles.has(`${proposalDate}|${title}`)) {
      continue;
    }
    if (
      recurringRules.some(
        (rule) =>
          rule.title.trim() === title && ruleCoversWeekday(rule, weekday),
      )
    ) {
      continue;
    }

    candidates.push({
      startMs: proposalStart.getTime(),
      suggestion: {
        key: `${title}|${weekday}`,
        title,
        weekday,
        date: proposalDate,
        startTime: formatTime(startMinutes),
        endTime: formatTime(endMinutes),
        occurrenceCount: bestDays,
      },
    });
  }

  candidates.sort(
    (a, b) =>
      b.suggestion.occurrenceCount - a.suggestion.occurrenceCount ||
      a.startMs - b.startMs ||
      a.suggestion.title.localeCompare(b.suggestion.title, "ja"),
  );
  return candidates.slice(0, MAX_SUGGESTIONS).map((c) => c.suggestion);
}
