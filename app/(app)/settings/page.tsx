import type { Metadata } from "next";
import Link from "next/link";
import { signOutAction } from "@/app/(app)/actions";
import { disconnectGoogleAction } from "@/app/(app)/settings/actions";
import { DeleteAccountSection } from "@/components/delete-account-section";
import { ThemeSelector } from "@/components/theme-selector";
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
      <h1 className="text-2xl font-bold tracking-tight">{M.heading}</h1>

      {googleEnabled && connected === "1" && (
        <p
          role="status"
          className="bg-success/10 text-success rounded-md px-4 py-3 text-sm"
        >
          {M.connectedSuccess}
        </p>
      )}
      {errorMessage && (
        <p
          role="alert"
          className="bg-danger/10 text-danger rounded-lg px-4 py-3 text-sm"
        >
          {errorMessage}
        </p>
      )}

      <section className="border-line bg-surface flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="text-base font-semibold">{M.accountSectionHeading}</h2>
        <div className="flex flex-col gap-1">
          <span className="text-ink-muted text-xs">{M.emailLabel}</span>
          <p className="text-sm">{data.user.email}</p>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="border-line hover:bg-ink/5 inline-flex min-h-11 items-center justify-center rounded-lg border px-4 text-sm font-medium transition-colors"
          >
            {M.signOutButton}
          </button>
        </form>
      </section>

      <section className="border-line bg-surface flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="text-base font-semibold">{M.themeSectionHeading}</h2>
        <ThemeSelector />
      </section>

      <section className="border-line bg-surface flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="text-base font-semibold">{M.helpSectionHeading}</h2>
        <Link
          href="/onboarding"
          className="border-line hover:bg-ink/5 inline-flex min-h-11 w-fit items-center justify-center rounded-lg border px-4 text-sm font-medium transition-colors"
        >
          {M.reviewOnboardingLink}
        </Link>
      </section>

      {googleEnabled ? (
        <section className="border-line bg-surface flex flex-col gap-3 rounded-lg border p-4">
          <h2 className="text-base font-semibold">{M.googleSectionHeading}</h2>
          <p className="text-ink-muted text-sm">
            {googleConnected ? M.connected : M.notConnected}
          </p>
          {googleConnected ? (
            <form action={disconnectGoogleAction}>
              <button
                type="submit"
                className="border-line hover:bg-ink/5 inline-flex min-h-11 items-center justify-center rounded-lg border px-4 text-sm font-medium transition-colors"
              >
                {M.disconnectButton}
              </button>
            </form>
          ) : (
            <a
              href="/api/google/connect"
              className="bg-brand text-brand-ink hover:bg-brand/90 inline-flex min-h-11 w-fit items-center justify-center rounded-lg px-6 text-sm font-medium transition-colors"
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
