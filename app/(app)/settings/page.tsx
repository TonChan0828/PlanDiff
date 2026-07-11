import type { Metadata } from "next";
import Link from "next/link";
import { signOutAction } from "@/app/(app)/actions";
import { disconnectGoogleAction } from "@/app/(app)/settings/actions";
import { DeleteAccountSection } from "@/components/delete-account-section";
import { isGoogleIntegrationEnabled } from "@/lib/google/integration-flag";
import { SETTINGS_MESSAGES as M } from "@/lib/settings/messages";
import { getGoogleRefreshToken } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "設定 | PlanDiff",
};

export const dynamic = "force-dynamic";

const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  google_state: M.errorState,
  google_auth: M.errorAuth,
  google_failed: M.errorFailed,
  google_no_refresh_token: M.errorNoRefreshToken,
};

// Google凍結中でも表示するエラー(P4-2)
const GENERAL_ERROR_MESSAGES: Record<string, string> = {
  account_delete_failed: M.errorAccountDeleteFailed,
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    // レイアウトで検証済みのため通常は到達しない
    return null;
  }

  const { connected, error } = await searchParams;
  // Google連携の凍結中(フラグOFF)は連携セクションを出さず、トークンも読まない(P2-5)
  const googleEnabled = isGoogleIntegrationEnabled();
  const errorMessage = error
    ? (GENERAL_ERROR_MESSAGES[error] ??
      (googleEnabled ? (GOOGLE_ERROR_MESSAGES[error] ?? null) : null))
    : null;
  let googleConnected = false;
  if (googleEnabled) {
    const tokenResult = await getGoogleRefreshToken(data.user.id);
    googleConnected = tokenResult.ok && tokenResult.refreshToken !== null;
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{M.heading}</h1>
        <Link
          href="/calendar"
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-zinc-300 px-4 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          {M.backToCalendar}
        </Link>
      </div>

      {googleEnabled && connected === "1" && (
        <p
          role="status"
          className="rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
        >
          {M.connectedSuccess}
        </p>
      )}
      {errorMessage && (
        <p
          role="alert"
          className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {errorMessage}
        </p>
      )}

      <section className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-base font-semibold">{M.accountSectionHeading}</h2>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500 dark:text-zinc-500">
            {M.emailLabel}
          </span>
          <p className="text-sm text-zinc-900 dark:text-zinc-100">
            {data.user.email}
          </p>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-zinc-300 px-4 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            {M.signOutButton}
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-base font-semibold">{M.helpSectionHeading}</h2>
        <Link
          href="/onboarding"
          className="inline-flex min-h-11 w-fit items-center justify-center rounded-full border border-zinc-300 px-4 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          {M.reviewOnboardingLink}
        </Link>
      </section>

      {googleEnabled ? (
        <section className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="text-base font-semibold">{M.googleSectionHeading}</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {googleConnected ? M.connected : M.notConnected}
          </p>
          {googleConnected ? (
            <form action={disconnectGoogleAction}>
              <button
                type="submit"
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-zinc-300 px-4 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                {M.disconnectButton}
              </button>
            </form>
          ) : (
            <a
              href="/api/google/connect"
              className="inline-flex min-h-11 w-fit items-center justify-center rounded-full bg-zinc-900 px-6 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {M.connectButton}
            </a>
          )}
        </section>
      ) : null}

      <DeleteAccountSection />
    </main>
  );
}
