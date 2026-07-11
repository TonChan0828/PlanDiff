import type { Metadata } from "next";
import { OnboardingSteps } from "@/components/onboarding-steps";
import { ONBOARDING_MESSAGES as M } from "@/lib/onboarding/messages";

export const metadata: Metadata = {
  title: "使い方 | PlanDiff",
};

// オンボーディング画面(P4-1)。初回/calendar訪問時にリダイレクトされる他、
// 設定画面から再閲覧もできる(状態に関わらず直接アクセス可能)
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const errorMessage = error === "save_failed" ? M.errorSaveFailed : null;

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-2xl font-bold tracking-tight">{M.heading}</h1>
      {errorMessage && (
        <p
          role="alert"
          className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {errorMessage}
        </p>
      )}
      <OnboardingSteps />
    </main>
  );
}
