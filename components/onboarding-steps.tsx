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
        <span className="text-sm text-zinc-500 dark:text-zinc-400">
          {M.stepLabel(stepIndex + 1, ONBOARDING_STEPS.length)}
        </span>
        <form action={completeOnboardingAction}>
          <button
            type="submit"
            className="min-h-11 text-sm font-medium text-zinc-500 underline-offset-4 hover:underline dark:text-zinc-400"
          >
            {M.skip}
          </button>
        </form>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
        <h2 className="text-xl font-bold tracking-tight">{step.title}</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {step.description}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        {isFirst ? (
          <span />
        ) : (
          <button
            type="button"
            onClick={() => setStepIndex((current) => current - 1)}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-zinc-300 px-6 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            {M.back}
          </button>
        )}
        {isLast ? (
          <form action={completeOnboardingAction}>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-zinc-900 px-6 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {M.start}
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setStepIndex((current) => current + 1)}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-zinc-900 px-6 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {M.next}
          </button>
        )}
      </div>
    </div>
  );
}
