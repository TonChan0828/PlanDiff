import { differenceInMinutes, format, isSameDay, parseISO } from "date-fns";
import { formatDurationMinutes } from "@/lib/summary/format";
import {
  computePlanActualDiff,
  type ActualGapInput,
  type PlanEventForGap,
} from "@/lib/timer/gap";
import { TIMER_MESSAGES as T } from "@/lib/timer/messages";

/** 編集中の実績が紐づく予定と、画面にある実績(実行中を含む。サマリーと同じ対象) */
export interface PlanDiffContext {
  plan: PlanEventForGap;
  actuals: ActualGapInput[];
}

function startLabel(minutes: number): string {
  if (minutes === 0) return T.planDiffStartOnTime;
  const duration = formatDurationMinutes(Math.abs(minutes));
  return minutes > 0
    ? T.planDiffStartLate(duration)
    : T.planDiffStartEarly(duration);
}

function durationLabel(minutes: number): string {
  if (minutes === 0) return T.planDiffOnTime;
  const duration = formatDurationMinutes(Math.abs(minutes));
  return minutes > 0 ? T.planDiffOver(duration) : T.planDiffShort(duration);
}

/** 実績の編集フォームの「予定とのズレ」欄(G-98)。edited は入力中の値 */
export function PlanDiffSummary({
  context,
  edited,
}: {
  context: PlanDiffContext;
  /** 入力が未完成なら null(予定の時刻だけを出す) */
  edited: ActualGapInput | null;
}) {
  const start = parseISO(context.plan.startAt);
  const end = parseISO(context.plan.endAt);
  const pattern = isSameDay(start, end) ? "HH:mm" : "M/d HH:mm";
  const diff = edited
    ? computePlanActualDiff(edited, context.actuals, context.plan)
    : null;
  return (
    <div
      role="group"
      aria-label={T.planDiffHeading}
      className="border-line flex flex-col gap-1 rounded-lg border px-3 py-2 text-sm"
    >
      <p className="text-ink-muted text-xs font-semibold">
        {T.planDiffHeading}
      </p>
      <p className="text-ink-muted font-mono text-xs tabular-nums">
        {T.planDiffPlan(
          `${format(start, pattern)}〜${format(end, pattern)}`,
          formatDurationMinutes(differenceInMinutes(end, start)),
        )}
      </p>
      {diff ? (
        <>
          <p className="font-mono tabular-nums">
            {startLabel(diff.startDiffMinutes)}
          </p>
          <p className="font-mono tabular-nums">
            {durationLabel(diff.durationDiffMinutes)}
          </p>
          {diff.entryCount > 1 ? (
            <p className="text-ink-muted text-xs">
              {T.planDiffTotalNote(diff.entryCount)}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
