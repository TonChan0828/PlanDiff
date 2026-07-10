import type { Metadata } from "next";
import Link from "next/link";
import { signOutAction } from "@/app/(app)/actions";
import { CalendarView } from "@/components/calendar-view";
import { fetchSyncedEvents } from "@/lib/calendar/events";
import { CALENDAR_MESSAGES as M } from "@/lib/calendar/messages";
import { parseDateParam } from "@/lib/calendar/view-date";
import { isGoogleIntegrationEnabled } from "@/lib/google/integration-flag";
import { SUMMARY_MESSAGES } from "@/lib/summary/messages";
import { getGoogleRefreshToken } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { fetchRunningEntry, fetchTimeEntries } from "@/lib/timer/entries";

export const metadata: Metadata = {
  title: "カレンダー | PlanDiff",
};

interface CalendarSearchParams {
  view?: string | string[];
  date?: string | string[];
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// カレンダービュー(P2-1)。日/週の表示状態はURL(?view&date)で保持する
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<CalendarSearchParams>;
}) {
  const params = await searchParams;
  const viewParam = firstParam(params.view);
  const dateParam = firstParam(params.date);

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    // レイアウトで検証済みのため通常は到達しない
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", data.user.id)
    .single();
  const displayName = profile?.display_name || data.user.email || "ユーザー";

  // dateパラメータ省略時はサーバーTZの「今日」で概算する
  // (読み取りは表示週±1週間のためTZ差はバッファが吸収する。表示上の選択日はクライアントが確定)
  const baseDate = parseDateParam(dateParam) ?? new Date();
  // Google連携の凍結中(フラグOFF)はトークンを読まず、同期UIも無効にする(P2-5)
  const googleEnabled = isGoogleIntegrationEnabled();
  const [events, timeEntries, runningEntry, tokenResult] = await Promise.all([
    fetchSyncedEvents(supabase, baseDate),
    fetchTimeEntries(supabase, baseDate),
    fetchRunningEntry(supabase),
    googleEnabled ? getGoogleRefreshToken(data.user.id) : Promise.resolve(null),
  ]);
  const googleConnected =
    googleEnabled &&
    tokenResult !== null &&
    tokenResult.ok &&
    tokenResult.refreshToken !== null;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{M.heading}</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/summary"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-zinc-300 px-4 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            {SUMMARY_MESSAGES.summaryLink}
          </Link>
          <Link
            href="/settings"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-zinc-300 px-4 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            {M.settingsLink}
          </Link>
          <form action={signOutAction}>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-zinc-300 px-4 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              {M.signOut}
            </button>
          </form>
        </div>
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {displayName} {M.loggedInSuffix}
      </p>
      <CalendarView
        events={events}
        timeEntries={timeEntries}
        runningEntry={runningEntry}
        viewParam={viewParam}
        dateParam={dateParam}
        googleConnected={googleConnected}
        googleEnabled={googleEnabled}
      />
    </main>
  );
}
