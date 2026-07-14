import "server-only";

import { TZDate } from "@date-fns/tz";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeSyncRange } from "@/lib/google/sync-range";
import {
  RECURRING_ID_PREFIX,
  parseRecurringEventId,
  type RecurringPattern,
  type RecurringRuleSummary,
} from "@/lib/calendar/recurring-id";

// 定期予定(P5-1)の展開ロジック。仕様書: docs/specs/P5-1_定期予定.md
// expandOccurrences は純粋関数(DB非依存)。ルールのローカル時刻+IANAタイムゾーンから、
// 指定範囲内の発生(UTC開始/終了)を列挙する。
// ルールCRUD・実体化は synced_events に source='app'・
// google_event_id='rec:<ruleId>:<occurrenceDate>' で保存し、既存のタイマー/オーバーレイ/
// サマリーのロジックを無改修で機能させる(P2-5の app: プレフィックスと同じ設計)。
// RECURRING_ID_PREFIX・parseRecurringEventId・RecurringPattern はクライアントからも参照するため
// "server-only" を持たない lib/calendar/recurring-id.ts に定義されている(ここでは再エクスポートする)。

export { RECURRING_ID_PREFIX, parseRecurringEventId, type RecurringPattern };

export interface RecurringRuleInput {
  pattern: RecurringPattern;
  /** weekly のときのみ使用。0=日曜〜6=土曜(JSのDate#getDayと一致) */
  weekdays: number[] | null;
  /** "HH:mm" 形式。ルールのtimezoneにおけるローカル時刻 */
  startTime: string;
  /** "HH:mm" 形式。ルールのtimezoneにおけるローカル時刻 */
  endTime: string;
  /** IANAタイムゾーン名 */
  timezone: string;
  /** "YYYY-MM-DD" 形式 */
  startsOn: string;
  /** "YYYY-MM-DD" 形式。nullは無期限 */
  endsOn: string | null;
}

export interface Occurrence {
  /** ルールのtimezoneにおける発生日(YYYY-MM-DD) */
  occurrenceDate: string;
  /** UTCのISO文字列 */
  startAt: string;
  /** UTCのISO文字列 */
  endAt: string;
}

function parseTimeParts(time: string): [number, number] {
  const [hour, minute] = time.split(":").map(Number);
  return [hour ?? 0, minute ?? 0];
}

function parseDateOnlyParts(date: string): [number, number, number] {
  const [year, month, day] = date.split("-").map(Number);
  return [year ?? 0, (month ?? 1) - 1, day ?? 1];
}

function formatDateOnly(year: number, month: number, day: number): string {
  const mm = String(month + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function matchesPattern(rule: RecurringRuleInput, weekday: number): boolean {
  switch (rule.pattern) {
    case "daily":
      return true;
    case "weekdays":
      return weekday >= 1 && weekday <= 5;
    case "weekly":
      return (rule.weekdays ?? []).includes(weekday);
    default:
      return false;
  }
}

export function expandOccurrences(
  rule: RecurringRuleInput,
  rangeStartUtc: Date,
  rangeEndUtc: Date,
): Occurrence[] {
  const [startHour, startMinute] = parseTimeParts(rule.startTime);
  const [endHour, endMinute] = parseTimeParts(rule.endTime);
  const [startsYear, startsMonth, startsDay] = parseDateOnlyParts(
    rule.startsOn,
  );
  const endsOnParts = rule.endsOn ? parseDateOnlyParts(rule.endsOn) : null;

  const rangeStartMs = rangeStartUtc.getTime();
  const rangeEndMs = rangeEndUtc.getTime();

  // 走査範囲: 範囲境界をルールのtimezoneでの日付に変換し、TZ差を吸収するため前後1日分広げる。
  // 実際の重なり判定は各発生のUTC開始/終了で厳密に行うため、ここでの広げ幅は安全マージンでよい。
  const scanStart = new TZDate(rangeStartUtc, rule.timezone);
  scanStart.setDate(scanStart.getDate() - 1);
  const scanEnd = new TZDate(rangeEndUtc, rule.timezone);
  scanEnd.setDate(scanEnd.getDate() + 1);

  const startsOnAtMidnight = new TZDate(
    startsYear,
    startsMonth,
    startsDay,
    0,
    0,
    0,
    rule.timezone,
  );
  const endsOnAtMidnight = endsOnParts
    ? new TZDate(
        endsOnParts[0],
        endsOnParts[1],
        endsOnParts[2],
        0,
        0,
        0,
        rule.timezone,
      )
    : null;

  const occurrences: Occurrence[] = [];
  const cursor = new TZDate(
    scanStart.getFullYear(),
    scanStart.getMonth(),
    scanStart.getDate(),
    0,
    0,
    0,
    rule.timezone,
  );

  while (cursor.getTime() <= scanEnd.getTime()) {
    const cursorYear = cursor.getFullYear();
    const cursorMonth = cursor.getMonth();
    const cursorDay = cursor.getDate();

    const withinPeriod =
      cursor.getTime() >= startsOnAtMidnight.getTime() &&
      (!endsOnAtMidnight || cursor.getTime() <= endsOnAtMidnight.getTime());

    if (withinPeriod && matchesPattern(rule, cursor.getDay())) {
      const startAt = new TZDate(
        cursorYear,
        cursorMonth,
        cursorDay,
        startHour,
        startMinute,
        0,
        rule.timezone,
      );
      const endAt = new TZDate(
        cursorYear,
        cursorMonth,
        cursorDay,
        endHour,
        endMinute,
        0,
        rule.timezone,
      );

      if (startAt.getTime() < rangeEndMs && endAt.getTime() > rangeStartMs) {
        occurrences.push({
          occurrenceDate: formatDateOnly(cursorYear, cursorMonth, cursorDay),
          startAt: new Date(startAt.getTime()).toISOString(),
          endAt: new Date(endAt.getTime()).toISOString(),
        });
      }
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return occurrences;
}

// --- ルールCRUD(Server Actionから呼ぶ)。P2-5の app-events.ts と同じパターン ---

const MAX_TITLE_LENGTH = 200;
const TIME_PATTERN = /^\d{2}:\d{2}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface RecurringRuleFormInput {
  title: string;
  pattern: RecurringPattern;
  weekdays: number[] | null;
  /** "HH:mm" 形式 */
  startTime: string;
  /** "HH:mm" 形式 */
  endTime: string;
  timezone: string;
  /** "YYYY-MM-DD" 形式 */
  startsOn: string;
  /** "YYYY-MM-DD" 形式。nullは無期限 */
  endsOn: string | null;
}

export type RecurringRuleResult = { ok: true } | { ok: false };

interface ValidatedRecurringRule {
  title: string;
  pattern: RecurringPattern;
  weekdays: number[] | null;
  startTime: string;
  endTime: string;
  timezone: string;
  startsOn: string;
  endsOn: string | null;
}

function isValidTimeZone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** ルール入力のサーバー側バリデーション。不合格は null(呼び出し側は書き込まない) */
export function validateRecurringRuleInput(
  input: RecurringRuleFormInput,
): ValidatedRecurringRule | null {
  const title = input.title.trim();
  if (title.length === 0 || title.length > MAX_TITLE_LENGTH) {
    return null;
  }
  if (
    !TIME_PATTERN.test(input.startTime) ||
    !TIME_PATTERN.test(input.endTime)
  ) {
    return null;
  }
  if (input.startTime >= input.endTime) {
    return null;
  }
  if (!isValidTimeZone(input.timezone)) {
    return null;
  }
  if (!DATE_PATTERN.test(input.startsOn)) {
    return null;
  }
  if (input.endsOn !== null) {
    if (!DATE_PATTERN.test(input.endsOn) || input.endsOn < input.startsOn) {
      return null;
    }
  }
  let weekdays: number[] | null = null;
  if (input.pattern === "weekly") {
    const raw = input.weekdays ?? [];
    if (raw.length === 0 || raw.length > 7) {
      return null;
    }
    if (raw.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
      return null;
    }
    if (new Set(raw).size !== raw.length) {
      return null;
    }
    weekdays = [...raw].sort((a, b) => a - b);
  }
  return {
    title,
    pattern: input.pattern,
    weekdays,
    startTime: input.startTime,
    endTime: input.endTime,
    timezone: input.timezone,
    startsOn: input.startsOn,
    endsOn: input.endsOn,
  };
}

function toRuleRow(validated: ValidatedRecurringRule) {
  return {
    title: validated.title,
    pattern: validated.pattern,
    weekdays: validated.weekdays,
    start_time: validated.startTime,
    end_time: validated.endTime,
    timezone: validated.timezone,
    starts_on: validated.startsOn,
    ends_on: validated.endsOn,
  };
}

/** ルールのtimezoneでの「今日」の0時(UTC ISO)と日付文字列(YYYY-MM-DD) */
function todayBoundary(
  timezone: string,
  now: Date = new Date(),
): { utcThresholdIso: string; dateOnly: string } {
  const zonedNow = new TZDate(now, timezone);
  const year = zonedNow.getFullYear();
  const month = zonedNow.getMonth();
  const day = zonedNow.getDate();
  const startOfDay = new TZDate(year, month, day, 0, 0, 0, timezone);
  return {
    utcThresholdIso: new Date(startOfDay.getTime()).toISOString(),
    dateOnly: formatDateOnly(year, month, day),
  };
}

export async function createRecurringRule(
  client: SupabaseClient,
  input: RecurringRuleFormInput,
): Promise<RecurringRuleResult> {
  const { data: userData } = await client.auth.getUser();
  if (!userData.user) {
    return { ok: false };
  }
  const validated = validateRecurringRuleInput(input);
  if (!validated) {
    return { ok: false };
  }
  const { error } = await client.from("recurring_rules").insert({
    user_id: userData.user.id,
    ...toRuleRow(validated),
  });
  return error ? { ok: false } : { ok: true };
}

export async function updateRecurringRule(
  client: SupabaseClient,
  ruleId: string,
  input: RecurringRuleFormInput,
): Promise<RecurringRuleResult> {
  const { data: userData } = await client.auth.getUser();
  if (!userData.user) {
    return { ok: false };
  }
  const validated = validateRecurringRuleInput(input);
  if (!validated) {
    return { ok: false };
  }
  const { data, error } = await client
    .from("recurring_rules")
    .update(toRuleRow(validated))
    .eq("id", ruleId)
    .select("id");
  if (error || !data || data.length === 0) {
    return { ok: false };
  }

  // 今日以降の実体化済みインスタンス・例外を削除する(再実体化でルールどおりに戻る)。
  // 過去の行には触れない(仕様書P5-1)
  const { utcThresholdIso, dateOnly } = todayBoundary(validated.timezone);
  const prefix = `${RECURRING_ID_PREFIX}${ruleId}:`;
  await client
    .from("synced_events")
    .delete()
    .eq("source", "app")
    .like("google_event_id", `${prefix}%`)
    .gte("start_at", utcThresholdIso);
  await client
    .from("recurring_exceptions")
    .delete()
    .eq("rule_id", ruleId)
    .gte("occurrence_date", dateOnly);

  return { ok: true };
}

export async function deleteRecurringRule(
  client: SupabaseClient,
  ruleId: string,
): Promise<RecurringRuleResult> {
  const { data: userData } = await client.auth.getUser();
  if (!userData.user) {
    return { ok: false };
  }
  const { data: ruleRows, error: ruleError } = await client
    .from("recurring_rules")
    .select("id, timezone")
    .eq("id", ruleId);
  if (ruleError || !ruleRows || ruleRows.length === 0) {
    return { ok: false };
  }
  const timezone = ruleRows[0]!.timezone as string;

  // 今日以降のインスタンスのみ削除する。過去のインスタンスは残す(計画していた事実を保持。仕様書P5-1)
  const { utcThresholdIso } = todayBoundary(timezone);
  const prefix = `${RECURRING_ID_PREFIX}${ruleId}:`;
  await client
    .from("synced_events")
    .delete()
    .eq("source", "app")
    .like("google_event_id", `${prefix}%`)
    .gte("start_at", utcThresholdIso);

  // recurring_exceptions は外部キーの on delete cascade で自動的に削除される
  const { error } = await client
    .from("recurring_rules")
    .delete()
    .eq("id", ruleId);
  return error ? { ok: false } : { ok: true };
}

export async function deleteRecurringOccurrence(
  client: SupabaseClient,
  eventId: string,
): Promise<RecurringRuleResult> {
  const { data: userData } = await client.auth.getUser();
  if (!userData.user) {
    return { ok: false };
  }
  const { data: rows, error: selectError } = await client
    .from("synced_events")
    .select("id, source, google_event_id")
    .eq("id", eventId);
  if (selectError || !rows || rows.length === 0) {
    return { ok: false };
  }
  const row = rows[0]!;
  if (row.source !== "app") {
    return { ok: false };
  }
  const parsed = parseRecurringEventId(row.google_event_id as string);
  if (!parsed) {
    return { ok: false };
  }

  // unique制約違反(登録済み)は成功扱い。それ以外のエラーのみ失敗として扱う
  const { error: insertError } = await client
    .from("recurring_exceptions")
    .insert({
      rule_id: parsed.ruleId,
      user_id: userData.user.id,
      occurrence_date: parsed.occurrenceDate,
    });
  if (insertError && insertError.code !== "23505") {
    return { ok: false };
  }

  const { data: deleted, error: deleteError } = await client
    .from("synced_events")
    .delete()
    .eq("id", eventId)
    .eq("source", "app")
    .select("id");
  if (deleteError || !deleted || deleted.length === 0) {
    return { ok: false };
  }
  return { ok: true };
}

// --- ルール一覧の取得(CalendarViewへpropsとして渡す。全体編集モードの初期値に使う) ---

interface RecurringRuleRow {
  id: string;
  title: string;
  pattern: RecurringPattern;
  weekdays: number[] | null;
  start_time: string;
  end_time: string;
  timezone: string;
  starts_on: string;
  ends_on: string | null;
}

/** 本人の繰り返しルール一覧をUI表示用の形(HH:mmに正規化)で返す */
export async function fetchRecurringRules(
  client: SupabaseClient,
): Promise<RecurringRuleSummary[]> {
  const { data, error } = await client
    .from("recurring_rules")
    .select(
      "id, title, pattern, weekdays, start_time, end_time, timezone, starts_on, ends_on",
    )
    .order("created_at", { ascending: true });
  if (error || !data) {
    return [];
  }
  return (data as unknown as RecurringRuleRow[]).map((rule) => ({
    id: rule.id,
    title: rule.title,
    pattern: rule.pattern,
    weekdays: rule.weekdays,
    startTime: rule.start_time.slice(0, 5),
    endTime: rule.end_time.slice(0, 5),
    timezone: rule.timezone,
    startsOn: rule.starts_on,
    endsOn: rule.ends_on,
  }));
}

// --- 実体化(表示範囲の読み込み時に呼ぶ) ---

/**
 * 本人の繰り返しルールを表示範囲(baseDateの週±1週間)に展開し、
 * synced_events へ source='app' で冪等insertする(ON CONFLICT DO NOTHING)。
 * 既存行(個別編集済みの回を含む)は一切上書きしない。失敗してもページ全体は落とさない。
 */
export async function materializeRecurringInstances(
  client: SupabaseClient,
  baseDate: Date,
): Promise<void> {
  const { data: userData } = await client.auth.getUser();
  if (!userData.user) {
    return;
  }

  const { data: rules, error: rulesError } = await client
    .from("recurring_rules")
    .select(
      "id, title, pattern, weekdays, start_time, end_time, timezone, starts_on, ends_on",
    );
  if (rulesError || !rules || rules.length === 0) {
    return;
  }

  const ruleRows = rules as unknown as RecurringRuleRow[];
  const ruleIds = ruleRows.map((rule) => rule.id);

  const { data: exceptions } = await client
    .from("recurring_exceptions")
    .select("rule_id, occurrence_date")
    .in("rule_id", ruleIds);

  const exceptionsByRule = new Map<string, Set<string>>();
  for (const exception of exceptions ?? []) {
    const ruleId = exception.rule_id as string;
    const set = exceptionsByRule.get(ruleId) ?? new Set<string>();
    set.add(exception.occurrence_date as string);
    exceptionsByRule.set(ruleId, set);
  }

  const range = computeSyncRange(baseDate);
  const rangeStart = new Date(range.timeMin);
  const rangeEnd = new Date(range.timeMax);

  const rows: {
    user_id: string;
    source: "app";
    google_event_id: string;
    title: string;
    start_at: string;
    end_at: string;
  }[] = [];

  for (const rule of ruleRows) {
    const ruleInput: RecurringRuleInput = {
      pattern: rule.pattern,
      weekdays: rule.weekdays,
      startTime: rule.start_time.slice(0, 5),
      endTime: rule.end_time.slice(0, 5),
      timezone: rule.timezone,
      startsOn: rule.starts_on,
      endsOn: rule.ends_on,
    };
    const occurrences = expandOccurrences(ruleInput, rangeStart, rangeEnd);
    const excluded = exceptionsByRule.get(rule.id) ?? new Set<string>();
    for (const occurrence of occurrences) {
      if (excluded.has(occurrence.occurrenceDate)) {
        continue;
      }
      rows.push({
        user_id: userData.user.id,
        source: "app",
        google_event_id: `${RECURRING_ID_PREFIX}${rule.id}:${occurrence.occurrenceDate}`,
        title: rule.title,
        start_at: occurrence.startAt,
        end_at: occurrence.endAt,
      });
    }
  }

  if (rows.length === 0) {
    return;
  }

  const { error: upsertError } = await client
    .from("synced_events")
    .upsert(rows, {
      onConflict: "user_id,google_event_id",
      ignoreDuplicates: true,
    });
  if (upsertError) {
    // 実体化の失敗でページ全体を落とさない(既存分の表示は継続する)
    console.error("繰り返し予定の実体化に失敗しました", upsertError);
  }
}
