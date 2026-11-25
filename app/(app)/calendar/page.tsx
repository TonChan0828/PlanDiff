import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarView } from "@/components/calendar-view";
import { fetchSyncedEvents } from "@/lib/calendar/events";
import { CALENDAR_MESSAGES as M } from "@/lib/calendar/messages";
import { prepareRecurringEvents } from "@/lib/calendar/recurring-sync";
import { fetchRulePauseSuggestions } from "@/lib/calendar/rule-pausing";
import { parseDateParam } from "@/lib/calendar/view-date";
import { isGoogleIntegrationEnabled } from "@/lib/google/integration-flag";
import { shouldRedirectToOnboarding } from "@/lib/onboarding/status";
import { getGoogleRefreshToken } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/session-user";
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
  create?: string | string[];
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
  const createParam = firstParam(params.create);

  const supabase = await createClient();
  const sessionUser = await getSessionUser(supabase);
  if (!sessionUser) {
    // レイアウトで検証済みのため通常は到達しない
    return null;
  }

  // dateパラメータ省略時はサーバーTZの「今日」で概算する
  // (読み取りは表示週±1週間のためTZ差はバッファが吸収する。表示上の選択日はクライアントが確定)
  const baseDate = parseDateParam(dateParam) ?? new Date();
  // Google連携の凍結中(フラグOFF)はトークンを読まず、同期UIも無効にする(P2-5)
  const googleEnabled = isGoogleIntegrationEnabled();

  // オンボ判定の profiles 取得は実体化と独立なので並列化する(P6-1)。
  // 定期予定の準備(実体化 → 自動調整 → 再実体化)は prepareRecurringEvents にまとめてある(G-112)。
  // 実体化は fetchSyncedEvents の直前に完了させる必要がある(P5-1)ため、読み取りの Promise.all より前に置く。
  // 自動調整は書き込みなので、オンボーディング済みと分かってから行う(canAdjust)。
  // redirect() は例外を投げるため Promise.all の中では呼ばず、解決後に判定する
  const now = new Date();
  // Supabase のクエリは then() のたびにリクエストを送る。Promise に一度だけ変換し、
  // Promise.all と canAdjust の両方で同じ結果を使い回す(プロフィールの取得を二重に送らない)
  const profilePromise = Promise.resolve(
    supabase
      .from("profiles")
      .select("onboarded_at")
      .eq("id", sessionUser.id)
      .single(),
  );
  const [profileResult, prepared] = await Promise.all([
    profilePromise,
    prepareRecurringEvents(supabase, {
      baseDate,
      now,
      canAdjust: profilePromise.then(
        (result) => !shouldRedirectToOnboarding(result.data),
      ),
    }),
  ]);
  if (shouldRedirectToOnboarding(profileResult.data)) {
    redirect("/onboarding");
  }
  const { recurringRules: finalRecurringRules, ruleAdjustments } = prepared;
  // 休止提案(P10-2)の対象は提案経由のルールのまま(P10-3のスコープ外)
  const hasSuggestionOriginRules = finalRecurringRules.some(
    (rule) => rule.origin === "suggestion",
  );

  const [
    events,
    timeEntries,
    runningEntry,
    tokenResult,
    suggestionEntries,
    pauseSuggestions,
  ] = await Promise.all([
    fetchSyncedEvents(supabase, baseDate),
    fetchTimeEntries(supabase, baseDate),
    fetchRunningEntry(supabase),
    googleEnabled
      ? getGoogleRefreshToken(sessionUser.id)
      : Promise.resolve(null),
    fetchSuggestionSourceEntries(supabase, baseDate),
    hasSuggestionOriginRules
      ? fetchRulePauseSuggestions(supabase)
      : Promise.resolve([]),
  ]);
  const googleConnected =
    googleEnabled &&
    tokenResult !== null &&
    tokenResult.ok &&
    tokenResult.refreshToken !== null;

  return (
    <main className="flex min-h-0 w-full flex-1 flex-col px-3 pt-3 pb-2 sm:px-5 lg:px-4">
      {/* ワードマーク+ツールバーが見出しを兼ねるため、h1はスクリーンリーダー向けのみ(D-1c) */}
      <h1 className="sr-only">{M.heading}</h1>
      <CalendarView
        events={events}
        timeEntries={timeEntries}
        runningEntry={runningEntry}
        viewParam={viewParam}
        dateParam={dateParam}
        startCreating={createParam === "1"}
        googleConnected={googleConnected}
        googleEnabled={googleEnabled}
        recurringRules={finalRecurringRules}
        suggestionEntries={suggestionEntries}
        ruleAdjustments={ruleAdjustments}
        pauseSuggestions={pauseSuggestions}
        reviewNow={now.toISOString()}
      />
    </main>
  );
}
