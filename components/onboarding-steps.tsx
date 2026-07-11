"use client";

import { useState } from "react";
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <span className="text-ink-muted text-sm">
          {M.stepLabel(stepIndex + 1, ONBOARDING_STEPS.length)}
        </span>
        <form action={completeOnboardingAction}>
          <button
            type="submit"
            className="text-ink-muted min-h-11 text-sm font-medium underline-offset-4 hover:underline"
          >
            {M.skip}
          </button>
        </form>
      </div>

      <div className="border-line bg-surface flex flex-col gap-3 rounded-xl border p-6">
        <h2 className="text-xl font-bold tracking-tight">{step.title}</h2>
        <p className="text-ink-muted text-sm">{step.description}</p>
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
            {M.back}
          </button>
        )}
        {isLast ? (
          <form action={completeOnboardingAction}>
            <button
              type="submit"
              className="bg-brand text-brand-ink hover:bg-brand/90 inline-flex min-h-11 items-center justify-center rounded-lg px-6 text-sm font-medium transition-colors"
            >
              {M.start}
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setStepIndex((current) => current + 1)}
            className="bg-brand text-brand-ink hover:bg-brand/90 inline-flex min-h-11 items-center justify-center rounded-lg px-6 text-sm font-medium transition-colors"
          >
            {M.next}
          </button>
        )}
      </div>
    </div>
  );
}
