import "server-only";
import { isIdentifier } from "@/lib/security/input";

import { TZDate } from "@date-fns/tz";
import { nullableRpcArg, type AppSupabaseClient } from "@/lib/supabase/types";
import {
  RECURRING_ID_PREFIX,
  isRulePaused,
  type RecurringRuleSummary,
  type RuleAdjustmentNotice,
} from "@/lib/calendar/recurring-id";
import { getSessionUser } from "@/lib/supabase/session-user";
import type { TimeEntryItem } from "@/lib/timer/types";

// 提案経由の定期予定の自動学習補正(P10-1)。仕様書: docs/specs/P10-1_提案経由予定の学習補正.md
// computeRuleAdjustments は純粋関数(DB非依存)。自動調整が有効な定期予定について、
// 紐づく実績("rec:<ruleId>:"プレフィックス)の中央値をもとに開始時刻・所要時間の
// 調整要否を判定する。computeSuggestions(P5-2)と同じ「中央値→5分丸め」の哲学を踏襲する。
// ルールの由来を問わずタイムゾーンは常にルール自身が持つ値を使うため、
// computeSuggestions と異なりブラウザのタイムゾーンには依存せずサーバー側で完結する。

export const ADJUSTMENT_LOOKBACK_DAYS = 42;
const MIN_SAMPLES_FOR_ADJUSTMENT = 3;
const ROUND_UNIT_MINUTES = 5;
export const RELEARN_INTERVAL_DAYS = 7;
const DAY_MINUTES = 24 * 60;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface RuleAdjustment {
  ruleId: string;
  title: string;
  timezone: string;
  changed: boolean;
  sampleCount?: number;
  /** "HH:mm" 形式 */
  previousStartTime: string;
  /** "HH:mm" 形式 */
  previousEndTime: string;
  /** "HH:mm" 形式。changed=trueのときのみ */
  newStartTime?: string;
  /** "HH:mm" 形式。changed=trueのときのみ */
  newEndTime?: string;
}

/** 予定1回分(同じ google_event_id)の実績をまとめた学習サンプル(P10-3) */
interface OccurrenceSample {
  /** その回で最も早い実績の開始(UTCミリ秒) */
  startMs: number;
  /** その回の各実績の所要の合計(分) */
  durationMinutes: number;
}

/**
 * 同じ予定(googleEventId)に紐づく実績を1回ぶんのサンプルにまとめる(P10-3)。
 * 中断→再計測(P5-4)で1回が複数の実績に分かれても、断片を1件ずつ数えないようにする。
 * 入力は同じルールに紐づく完了実績のみ(googleEventId は非null)。
 */
function aggregateOccurrences(entries: TimeEntryItem[]): OccurrenceSample[] {
  // 重なった実績(二重記録など)も単純に合計する。タイマーは同時に1本しか動かない
  // (partial unique index)ため、通常の計測では重なりは手動編集時にしか生じない。
  const byOccurrence = new Map<string, OccurrenceSample>();
  for (const entry of entries) {
    const startMs = new Date(entry.startAt).getTime();
    const durationMinutes =
      (new Date(entry.endAt).getTime() - startMs) / 60_000;
    const key = entry.googleEventId ?? "";
    const current = byOccurrence.get(key);
    byOccurrence.set(
      key,
      current
        ? {
            startMs: Math.min(current.startMs, startMs),
            durationMinutes: current.durationMinutes + durationMinutes,
          }
        : { startMs, durationMinutes },
    );
  }
  return [...byOccurrence.values()];
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

function minutesOf(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0);
}

function formatTime(totalMinutes: number): string {
  const hh = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const mm = String(totalMinutes % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** 再学習間隔(7日)未満なら false。lastLearnedAtがnullなら常にtrue */
function needsRelearn(lastLearnedAt: string | null, now: Date): boolean {
  if (!lastLearnedAt) {
    return true;
  }
  const diffDays =
    (now.getTime() - new Date(lastLearnedAt).getTime()) / MS_PER_DAY;
  return diffDays >= RELEARN_INTERVAL_DAYS;
}

/**
 * 自動調整が有効な定期予定について、紐づく実績から調整要否を判定する(P10-3で作成経路を問わなくなった)。
 * 対象外(autoAdjustEnabled=false・休止中・再学習間隔未満)のルールは結果に含まれない。
 */
export function computeRuleAdjustments(
  rules: RecurringRuleSummary[],
  entries: TimeEntryItem[],
  now: Date,
): RuleAdjustment[] {
  const results: RuleAdjustment[] = [];
  const lookbackMs = now.getTime() - ADJUSTMENT_LOOKBACK_DAYS * MS_PER_DAY;

  for (const rule of rules) {
    if (!rule.autoAdjustEnabled || isRulePaused(rule, now)) {
      continue;
    }
    if (!needsRelearn(rule.lastLearnedAt, now)) {
      continue;
    }

    const prefix = `${RECURRING_ID_PREFIX}${rule.id}:`;
    // 42日の範囲は「その回の最初の開始」で判定する(断片単位で切らない)
    const occurrences = aggregateOccurrences(
      entries.filter((entry) => entry.googleEventId?.startsWith(prefix)),
    ).filter(
      (occurrence) =>
        occurrence.startMs >= lookbackMs && occurrence.startMs <= now.getTime(),
    );

    const base: RuleAdjustment = {
      ruleId: rule.id,
      title: rule.title,
      timezone: rule.timezone,
      changed: false,
      previousStartTime: rule.startTime,
      previousEndTime: rule.endTime,
    };

    if (occurrences.length < MIN_SAMPLES_FOR_ADJUSTMENT) {
      results.push(base);
      continue;
    }

    const startMinutesList = occurrences
      .map((occurrence) => {
        const local = new TZDate(occurrence.startMs, rule.timezone);
        return local.getHours() * 60 + local.getMinutes();
      })
      .sort((a, b) => a - b);
    const durationMinutesList = occurrences
      .map((occurrence) => occurrence.durationMinutes)
      .sort((a, b) => a - b);

    const currentStartMinutes = minutesOf(rule.startTime);
    const currentDurationMinutes =
      minutesOf(rule.endTime) - currentStartMinutes;
    const proposedStart = roundToUnit(median(startMinutesList));
    const proposedDuration = Math.max(
      ROUND_UNIT_MINUTES,
      roundToUnit(median(durationMinutesList)),
    );
    // 項目ごとに判定し、閾値未満の項目は現在値を保つ。
    const newStartMinutes =
      Math.abs(proposedStart - currentStartMinutes) >= ROUND_UNIT_MINUTES
        ? proposedStart
        : currentStartMinutes;
    const newDurationMinutes =
      Math.abs(proposedDuration - currentDurationMinutes) >= ROUND_UNIT_MINUTES
        ? proposedDuration
        : currentDurationMinutes;
    const newEndMinutes = newStartMinutes + newDurationMinutes;
    if (
      newEndMinutes > DAY_MINUTES ||
      (newStartMinutes === currentStartMinutes &&
        newDurationMinutes === currentDurationMinutes)
    ) {
      results.push(base);
      continue;
    }

    results.push({
      ...base,
      changed: true,
      sampleCount: occurrences.length,
      newStartTime: formatTime(newStartMinutes),
      newEndTime: formatTime(newEndMinutes),
    });
  }

  return results;
}

/**
 * computeRuleAdjustments の結果をDBへ反映する。
 * changed=true のルールのみ start_time/end_time を更新し、未開始の実体化済み
 * インスタンス(synced_events)を削除して再実体化を促す。開始済みの行・recurring_exceptions
 * には一切触れない(既存の updateRecurringRule は使わない。仕様書「書き込みロジック」参照)。
 * changed=false のルールは last_learned_at のみ更新する(再学習間隔の間引き)。
 * 実際に変更が適用された分のみ通知データとして返す(お知らせ帯の表示に使う)。
 */
export async function applyRuleAdjustments(
  client: AppSupabaseClient,
  adjustments: RuleAdjustment[],
  now: Date = new Date(),
): Promise<RuleAdjustmentNotice[]> {
  const notices: RuleAdjustmentNotice[] = [];
  const nowIso = now.toISOString();

  for (const adjustment of adjustments) {
    const { data, error } = await client.rpc("apply_recurring_rule_learning", {
      p_rule_id: adjustment.ruleId,
      p_previous_start: adjustment.previousStartTime,
      p_previous_end: adjustment.previousEndTime,
      p_new_start: nullableRpcArg(
        adjustment.changed ? (adjustment.newStartTime ?? null) : null,
      ),
      p_new_end: nullableRpcArg(
        adjustment.changed ? (adjustment.newEndTime ?? null) : null,
      ),
      p_now: nowIso,
    });
    if (error || data !== true) continue;
    if (
      adjustment.changed &&
      adjustment.newStartTime &&
      adjustment.newEndTime
    ) {
      notices.push({
        ruleId: adjustment.ruleId,
        sampleCount: adjustment.sampleCount,
        title: adjustment.title,
        timezone: adjustment.timezone,
        previousStartTime: adjustment.previousStartTime,
        previousEndTime: adjustment.previousEndTime,
        newStartTime: adjustment.newStartTime,
        newEndTime: adjustment.newEndTime,
      });
    }
  }

  return notices;
}

/** 定期予定の自動学習補正を停止する(auto_adjust_enabled=false。origin は作成経路の記録として残す。P10-3) */
export async function disableRuleLearning(
  client: AppSupabaseClient,
  ruleId: string,
): Promise<{ ok: boolean }> {
  if (!isIdentifier(ruleId)) return { ok: false };
  const sessionUser = await getSessionUser(client);
  if (!sessionUser) {
    return { ok: false };
  }
  const { data, error } = await client
    .from("recurring_rules")
    .update({ auto_adjust_enabled: false })
    .eq("id", ruleId)
    .select("id");
  if (error || !data || data.length === 0) {
    return { ok: false };
  }
  return { ok: true };
}
