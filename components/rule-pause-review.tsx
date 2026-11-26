"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { setRulePauseAction } from "@/lib/calendar/actions";
import { CALENDAR_MESSAGES as M } from "@/lib/calendar/messages";
import {
  isRulePaused,
  type RecurringRuleSummary,
  type RulePauseSuggestion,
} from "@/lib/calendar/recurring-id";
import type { RulePauseAction } from "@/lib/calendar/rule-pausing";

/** 同じ名前の予定を区別するための「繰り返し条件 + 時刻」。時刻はルールのタイムゾーンのローカル時刻 */
function scheduleLabel(rule: RecurringRuleSummary): string {
  return M.pauseSchedule(
    M.suggestionPatternLabel(
      rule.pattern,
      rule.weekdays ?? [],
      M.weekdayLabels,
    ),
    rule.startTime,
    rule.endTime,
  );
}

/** "YYYY-MM-DD" を "2026/10/1" の形にする。Date を経由するとタイムゾーンで日がずれうる */
function formatDateOnlyLabel(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return `${year}/${month}/${day}`;
}

/**
 * 現在有効な(または開始予定の)休止の開始日の表示。終わった休止は対象にしない。
 * 開始日と終了日が同じ期間は除く: 終了日は含まないため1日も休止しない期間で
 * (同じ日に休止と再開予約をすると作られる)、開始予定と表示すると「翌日から再開予定」と矛盾する。
 */
function pauseStartLabel(
  rule: RecurringRuleSummary,
  today: string,
): string | null {
  const startsOnList = (rule.pauses ?? [])
    .filter(
      (pause) =>
        !pause.endsOn ||
        (pause.endsOn > today && pause.endsOn > pause.startsOn),
    )
    .map((pause) => pause.startsOn)
    .sort();
  // 今日を含む休止があればその開始日(すでに休止中なのに「予定」と出さない)。なければ最も早く始まるもの
  const current =
    startsOnList.filter((startsOn) => startsOn <= today).at(-1) ??
    startsOnList[0];
  if (!current) return null;
  const label = formatDateOnlyLabel(current);
  return current > today
    ? M.pauseStartsOnFuture(label)
    : M.pauseStartedOn(label);
}

const buttonClass =
  "border-line hover:bg-ink/5 rounded-control-lg min-h-11 border px-3 py-2 text-sm disabled:opacity-50";

function PauseReviewCard({
  title,
  schedule,
  children,
  actions,
  ruleId,
}: {
  title: string;
  /** 繰り返し条件と時刻(G-93)。対応するルールがなければ省略する */
  schedule?: string;
  children: ReactNode;
  actions: { action: RulePauseAction; label: string }[];
  ruleId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);
  const [failed, setFailed] = useState<RulePauseAction | null>(null);
  const [saved, setSaved] = useState<RulePauseAction | null>(null);

  function submit(action: RulePauseAction) {
    if (busy.current) return;
    busy.current = true;
    setFailed(null);
    startTransition(async () => {
      try {
        const result = await setRulePauseAction(ruleId, action);
        if (!result.ok) {
          setFailed(action);
          return;
        }
        setSaved(action);
        router.refresh();
      } catch {
        setFailed(action);
      } finally {
        busy.current = false;
      }
    });
  }

  if (saved === "snooze") return null;
  return (
    <article
      // 同じ名前のカードを読み上げでも区別できるよう、条件と時刻も名前に含める
      aria-label={schedule ? `${title} ${schedule}` : title}
      aria-busy={pending}
      className="border-line bg-surface rounded-lg border p-3 text-sm"
    >
      <h3 className="text-ink font-semibold">{title}</h3>
      {schedule ? (
        <p className="text-ink-muted mt-0.5 font-mono text-xs tabular-nums">
          {schedule}
        </p>
      ) : null}
      <div className="text-ink-muted mt-1 space-y-1">{children}</div>
      {saved ? (
        <p role="status" className="text-ink mt-2">
          {saved === "pause" ? M.pauseStartsTomorrow : M.pauseResumeScheduled}
        </p>
      ) : actions.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {actions.map(({ action, label }) => (
            <button
              key={action}
              type="button"
              className={buttonClass}
              disabled={pending}
              onClick={() => submit(action)}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
      {pending ? (
        <p role="status" className="text-ink-muted mt-2">
          {M.pausePending}
        </p>
      ) : null}
      {failed ? (
        <div role="alert" className="text-danger mt-2">
          <p>{M.pauseError}</p>
          <button
            type="button"
            className={buttonClass}
            disabled={pending}
            onClick={() => submit(failed)}
          >
            {M.pauseRetry}
          </button>
        </div>
      ) : null}
    </article>
  );
}

export function RulePauseReview({
  suggestions,
  rules,
  now,
}: {
  suggestions: RulePauseSuggestion[];
  rules: RecurringRuleSummary[];
  /** サーバーで確定した時刻を渡して、初回描画の日付差を避ける。 */
  now: string;
}) {
  const current = new Date(now);
  const paused = rules.filter((rule) => isRulePaused(rule, current));
  if (suggestions.length === 0 && paused.length === 0) return null;
  return (
    <div className="space-y-3">
      {suggestions.length > 0 ? (
        <details className="border-line rounded-lg border px-3 py-2">
          <summary className="text-ink min-h-9 cursor-pointer py-1 text-sm font-semibold">
            {M.pauseSuggestionsHeading}（{suggestions.length}件）
          </summary>
          <p className="text-ink-muted mb-2 text-xs">{M.pauseRecordHint}</p>
          <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
            {suggestions.map((suggestion) => {
              const rule = rules.find((r) => r.id === suggestion.ruleId);
              return (
                <PauseReviewCard
                  key={suggestion.ruleId}
                  ruleId={suggestion.ruleId}
                  title={suggestion.title}
                  schedule={rule ? scheduleLabel(rule) : undefined}
                  actions={[
                    { action: "pause", label: M.pauseAction },
                    { action: "snooze", label: M.pauseSnoozeAction },
                  ]}
                >
                  <p>{M.pauseSuggestion(suggestion.missedCount)}</p>
                  <p className="text-xs">
                    {suggestion.lastRecordedAt
                      ? M.pauseLastRecorded(
                          new Intl.DateTimeFormat("ja-JP", {
                            timeZone: suggestion.timezone,
                            year: "numeric",
                            month: "numeric",
                            day: "numeric",
                          }).format(new Date(suggestion.lastRecordedAt)),
                        )
                      : M.pauseNoRecords}
                  </p>
                  <p className="text-xs">{M.pauseStartsTomorrow}</p>
                </PauseReviewCard>
              );
            })}
          </div>
        </details>
      ) : null}
      {paused.length > 0 ? (
        <details className="border-line rounded-lg border px-3 py-2">
          <summary className="text-ink min-h-9 cursor-pointer py-1 text-sm font-semibold">
            {M.pausedRulesHeading}（{paused.length}件）
          </summary>
          <div className="mt-2 grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
            {paused.map((rule) => {
              const resuming = !(rule.pauses ?? []).some(
                (pause) => pause.endsOn === null,
              );
              const today = new Intl.DateTimeFormat("en-CA", {
                timeZone: rule.timezone,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              }).format(current);
              const expired = rule.endsOn !== null && rule.endsOn <= today;
              const startLabel = pauseStartLabel(rule, today);
              return (
                <PauseReviewCard
                  key={`${rule.id}:${resuming}`}
                  title={rule.title}
                  schedule={scheduleLabel(rule)}
                  ruleId={rule.id}
                  actions={
                    resuming || expired
                      ? []
                      : [{ action: "resume", label: M.pauseResumeAction }]
                  }
                >
                  <p>
                    {resuming
                      ? M.pauseResumeScheduled
                      : expired
                        ? M.pauseRuleEnded
                        : (rule.pauses ?? []).some(
                              (pause) =>
                                pause.endsOn === null && pause.startsOn > today,
                            )
                          ? M.pauseStartsTomorrow
                          : M.pauseActive}
                  </p>
                  {startLabel ? <p className="text-xs">{startLabel}</p> : null}
                </PauseReviewCard>
              );
            })}
          </div>
        </details>
      ) : null}
    </div>
  );
}
