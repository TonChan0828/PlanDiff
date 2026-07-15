"use client";

import { useState } from "react";
import {
  CalendarPlus,
  ChartNoAxesCombined,
  ChevronLeft,
  ChevronRight,
  Timer,
} from "lucide-react";
import { completeOnboardingAction } from "@/app/(app)/onboarding/actions";
import {
  ONBOARDING_MESSAGES as M,
  ONBOARDING_STEPS,
} from "@/lib/onboarding/messages";

// P4-1: オンボーディング3ステップのナビゲーション。
// ステップ切替は端末内のみ(サーバー通信なし)。完了(はじめる/スキップ)のみServer Actionを呼ぶ
export function OnboardingSteps() {
  const [stepIndex, setStepIndex] = useState(0);
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === ONBOARDING_STEPS.length - 1;
  const step = ONBOARDING_STEPS[stepIndex]!;
  const StepIcon =
    [CalendarPlus, Timer, ChartNoAxesCombined][stepIndex] ?? CalendarPlus;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <span className="text-ink-muted text-sm">
          {M.stepLabel(stepIndex + 1, ONBOARDING_STEPS.length)}
        </span>
        <form action={completeOnboardingAction}>
          <input type="hidden" name="intent" value="skip" />
          <button
            type="submit"
            className="text-ink-muted min-h-11 text-sm font-medium underline-offset-4 hover:underline"
          >
            {M.skip}
          </button>
        </form>
      </div>

      <div className="border-line flex flex-col gap-6 border-y py-8">
        <div className="border-plan-border bg-plan-fill text-brand flex h-16 w-16 items-center justify-center rounded-lg border">
          <StepIcon aria-hidden="true" className="h-8 w-8" />
        </div>
        <div className="flex flex-col gap-3">
          <h2 className="text-2xl font-bold tracking-tight">{step.title}</h2>
          <p className="text-ink-muted max-w-md text-sm leading-relaxed">
            {step.description}
          </p>
        </div>
        <div className="flex gap-1" aria-hidden="true">
          {ONBOARDING_STEPS.map((item, index) => (
            <span
              key={item.title}
              className={`h-1.5 flex-1 rounded-full ${index <= stepIndex ? "bg-brand" : "bg-ink/10"}`}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        {isFirst ? (
          <span />
        ) : (
          <button
            type="button"
            onClick={() => setStepIndex((current) => current - 1)}
            className="border-line hover:bg-ink/5 inline-flex min-h-11 items-center justify-center rounded-lg border px-6 text-sm font-medium transition-colors"
          >
            <ChevronLeft aria-hidden="true" className="mr-1.5 h-4 w-4" />
            {M.back}
          </button>
        )}
        {isLast ? (
          <form action={completeOnboardingAction}>
            <input type="hidden" name="intent" value="start" />
            <button
              type="submit"
              className="bg-brand text-brand-ink hover:bg-brand/90 inline-flex min-h-11 items-center justify-center rounded-lg px-6 text-sm font-medium transition-colors"
            >
              {M.start}
              <CalendarPlus aria-hidden="true" className="ml-1.5 h-4 w-4" />
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setStepIndex((current) => current + 1)}
            className="bg-brand text-brand-ink hover:bg-brand/90 inline-flex min-h-11 items-center justify-center rounded-lg px-6 text-sm font-medium transition-colors"
          >
            {M.next}
            <ChevronRight aria-hidden="true" className="ml-1.5 h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
