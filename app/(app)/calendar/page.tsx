import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarView } from "@/components/calendar-view";
import { fetchSyncedEvents } from "@/lib/calendar/events";
import { CALENDAR_MESSAGES as M } from "@/lib/calendar/messages";
import {
  fetchRecurringRules,
  materializeRecurringInstances,
} from "@/lib/calendar/recurring";
import { parseDateParam } from "@/lib/calendar/view-date";
import { isGoogleIntegrationEnabled } from "@/lib/google/integration-flag";
import { shouldRedirectToOnboarding } from "@/lib/onboarding/status";
import { getGoogleRefreshToken } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  fetchRunningEntry,
  fetchSuggestionSourceEntries,
  fetchTimeEntries,
} from "@/lib/timer/entries";

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
    .select("onboarded_at")
    .eq("id", data.user.id)
    .single();
  if (shouldRedirectToOnboarding(profile)) {
    redirect("/onboarding");
  }

  // dateパラメータ省略時はサーバーTZの「今日」で概算する
  // (読み取りは表示週±1週間のためTZ差はバッファが吸収する。表示上の選択日はクライアントが確定)
  const baseDate = parseDateParam(dateParam) ?? new Date();
  // Google連携の凍結中(フラグOFF)はトークンを読まず、同期UIも無効にする(P2-5)
  const googleEnabled = isGoogleIntegrationEnabled();
  // 繰り返し予定の実体化はfetchSyncedEventsの直前に完了させる必要があるため直列で実行する(P5-1)
  await materializeRecurringInstances(supabase, baseDate);
  const [
    events,
    timeEntries,
    runningEntry,
    tokenResult,
    recurringRules,
    suggestionEntries,
  ] = await Promise.all([
    fetchSyncedEvents(supabase, baseDate),
    fetchTimeEntries(supabase, baseDate),
    fetchRunningEntry(supabase),
    googleEnabled ? getGoogleRefreshToken(data.user.id) : Promise.resolve(null),
    fetchRecurringRules(supabase),
    fetchSuggestionSourceEntries(supabase, baseDate),
  ]);
  const googleConnected =
    googleEnabled &&
    tokenResult !== null &&
    tokenResult.ok &&
    tokenResult.refreshToken !== null;

  return (
    <main className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-3 pt-3 pb-2 sm:px-6">
      {/* ワードマーク+ツールバーが見出しを兼ねるため、h1はスクリーンリーダー向けのみ(D-1c) */}
      <h1 className="sr-only">{M.heading}</h1>
      <CalendarView
        events={events}
        timeEntries={timeEntries}
        runningEntry={runningEntry}
        viewParam={viewParam}
        dateParam={dateParam}
        googleConnected={googleConnected}
        googleEnabled={googleEnabled}
        recurringRules={recurringRules}
        suggestionEntries={suggestionEntries}
      />
    </main>
  );
}
