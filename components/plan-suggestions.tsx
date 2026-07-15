"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { TZDate } from "@date-fns/tz";
import {
  createAppEventAction,
  createRecurringRuleAction,
} from "@/app/(app)/calendar/event-actions";
import { CALENDAR_MESSAGES as M } from "@/lib/calendar/messages";
import type { RecurringRuleSummary } from "@/lib/calendar/recurring-id";
import {
  computeSuggestions,
  type PlanSuggestion,
  type SuggestionExistingEvent,
} from "@/lib/calendar/suggestions";
import { formatDurationMinutes } from "@/lib/summary/format";
import type { TimeEntryItem } from "@/lib/timer/types";

// 実績からの予定提案セクション(P5-2)。仕様書: docs/specs/P5-2_実績からの予定提案.md
// 提案の計算(computeSuggestions)は曜日・時刻がユーザーのTZに依存するためクライアントで行い、
// 受け入れは既存のServer Action(単発=createAppEventAction / 毎週=createRecurringRuleAction)を
// 再利用する。却下はセッション内の非表示のみ(永続化しない)。

interface PlanSuggestionsProps {
  /** 表示週開始前4週+バッファの完了実績(fetchSuggestionSourceEntries) */
  entries: TimeEntryItem[];
  /** 表示範囲の予定(重複判定用。title/startAt のみ参照) */
  events: SuggestionExistingEvent[];
  recurringRules: RecurringRuleSummary[];
  /** 表示週の基準日 "YYYY-MM-DD" */
  viewDate: string;
  /** テスト用。省略時は現在時刻 */
  now?: Date;
  /** テスト用。省略時はブラウザのタイムゾーン */
  timeZone?: string;
}

// 提案はTZ・現在時刻に依存するため、SSRとの不一致を避けてハイドレーション後にのみ描画する
// (calendar-view.tsx の useHydrated と同じパターン)
const emptySubscribe = () => () => {};
function useHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

function toUtcIso(date: string, time: string, timeZone: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(
    new TZDate(
      year ?? 0,
      (month ?? 1) - 1,
      day ?? 1,
      hour ?? 0,
      minute ?? 0,
      0,
      timeZone,
    ).getTime(),
  ).toISOString();
}

function minutesOf(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0);
}

export function PlanSuggestions({
  entries,
  events,
  recurringRules,
  viewDate,
  now,
  timeZone,
}: PlanSuggestionsProps) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [hiddenKeys, setHiddenKeys] = useState<ReadonlySet<string>>(new Set());
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const resolvedTimeZone =
    timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const suggestions = useMemo(
    () =>
      hydrated
        ? computeSuggestions({
            entries,
            events,
            recurringRules,
            viewDate,
            now: now ?? new Date(),
            timeZone: resolvedTimeZone,
          })
        : [],
    [
      hydrated,
      entries,
      events,
      recurringRules,
      viewDate,
      now,
      resolvedTimeZone,
    ],
  );

  const visible = suggestions.filter((s) => !hiddenKeys.has(s.key));
  if (visible.length === 0) {
    return null;
  }

  const hide = (key: string) => {
    setHiddenKeys((prev) => new Set(prev).add(key));
  };

  const accept = async (
    suggestion: PlanSuggestion,
    run: () => Promise<{ ok: boolean }>,
    errorMessage: string,
  ) => {
    setPendingKey(suggestion.key);
    setErrors((prev) => ({ ...prev, [suggestion.key]: "" }));
    try {
      const result = await run();
      if (result.ok) {
        hide(suggestion.key);
        router.refresh();
      } else {
        setErrors((prev) => ({ ...prev, [suggestion.key]: errorMessage }));
      }
    } catch {
      setErrors((prev) => ({ ...prev, [suggestion.key]: errorMessage }));
    } finally {
      setPendingKey(null);
    }
  };

  const addThisWeek = (suggestion: PlanSuggestion) =>
    accept(
      suggestion,
      () =>
        createAppEventAction({
          title: suggestion.title,
          startAt: toUtcIso(
            suggestion.date,
            suggestion.startTime,
            resolvedTimeZone,
          ),
          endAt: toUtcIso(
            suggestion.date,
            suggestion.endTime,
            resolvedTimeZone,
          ),
        }),
      M.suggestionAddError,
    );

  const makeWeekly = (suggestion: PlanSuggestion) =>
    accept(
      suggestion,
      () =>
        createRecurringRuleAction({
          title: suggestion.title,
          pattern: "weekly",
          weekdays: [suggestion.weekday],
          startTime: suggestion.startTime,
          endTime: suggestion.endTime,
          timezone: resolvedTimeZone,
          startsOn: suggestion.date,
          endsOn: null,
        }),
      M.suggestionMakeWeeklyError,
    );

  return (
    <section aria-label={M.suggestionHeading} className="flex flex-col gap-2">
      <h2 className="text-ink-muted text-xs font-semibold">
        {M.suggestionHeading}
      </h2>
      <ul className="flex flex-col gap-2">
        {visible.map((suggestion) => {
          const pending = pendingKey === suggestion.key;
          const error = errors[suggestion.key];
          return (
            <li
              key={suggestion.key}
              className="border-plan-border/40 bg-plan-fill/20 rounded-lg border px-3 py-2"
            >
              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0 py-1.5">
                  <p className="text-ink truncate text-sm font-medium">
                    {suggestion.title}
                  </p>
                  <p className="text-ink-muted text-xs">
                    {M.suggestionDescription(
                      M.weekdayLabels[suggestion.weekday] ?? "",
                      suggestion.startTime,
                      formatDurationMinutes(
                        minutesOf(suggestion.endTime) -
                          minutesOf(suggestion.startTime),
                      ),
                      suggestion.occurrenceCount,
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={M.suggestionDismissLabel(suggestion.title)}
                  onClick={() => hide(suggestion.key)}
                  className="text-ink-muted hover:bg-ink/5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-base"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
              {error ? (
                <p role="alert" className="text-danger mb-1 text-xs">
                  {error}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2 pb-1">
                <button
                  type="button"
                  onClick={() => addThisWeek(suggestion)}
                  disabled={pending}
                  className="border-plan-border/60 text-plan-text hover:bg-plan-fill/40 inline-flex min-h-11 items-center justify-center rounded-lg border px-3 text-sm font-medium disabled:opacity-50"
                >
                  {M.suggestionAddThisWeek}
                </button>
                <button
                  type="button"
                  onClick={() => makeWeekly(suggestion)}
                  disabled={pending}
                  className="border-line text-ink hover:bg-ink/5 inline-flex min-h-11 items-center justify-center rounded-lg border px-3 text-sm font-medium disabled:opacity-50"
                >
                  {M.suggestionMakeWeekly}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
