"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { setRulePauseAction } from "@/app/(app)/calendar/event-actions";
import { CALENDAR_MESSAGES as M } from "@/lib/calendar/messages";
import {
  isRulePaused,
  type RecurringRuleSummary,
  type RulePauseSuggestion,
} from "@/lib/calendar/recurring-id";
import type { RulePauseAction } from "@/lib/calendar/rule-pausing";

const buttonClass =
  "border-line hover:bg-ink/5 rounded-control-lg min-h-11 border px-3 py-2 text-sm disabled:opacity-50";

function PauseReviewCard({
  title,
  children,
  actions,
  ruleId,
}: {
  title: string;
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
      aria-label={title}
      aria-busy={pending}
      className="border-line bg-surface rounded-lg border p-3 text-sm"
    >
      <h3 className="text-ink font-semibold">{title}</h3>
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
            {suggestions.map((suggestion) => (
              <PauseReviewCard
                key={suggestion.ruleId}
                ruleId={suggestion.ruleId}
                title={suggestion.title}
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
            ))}
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
              return (
                <PauseReviewCard
                  key={`${rule.id}:${resuming}`}
                  title={rule.title}
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
                </PauseReviewCard>
              );
            })}
          </div>
        </details>
      ) : null}
    </div>
  );
}
