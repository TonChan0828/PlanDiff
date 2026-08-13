import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarView } from "@/components/calendar-view";
import { fetchSyncedEvents } from "@/lib/calendar/events";
import { CALENDAR_MESSAGES as M } from "@/lib/calendar/messages";
import { materializeRecurringInstances } from "@/lib/calendar/recurring";
import {
  applyRuleAdjustments,
  computeRuleAdjustments,
} from "@/lib/calendar/rule-learning";
import { parseDateParam } from "@/lib/calendar/view-date";
import { isGoogleIntegrationEnabled } from "@/lib/google/integration-flag";
import { shouldRedirectToOnboarding } from "@/lib/onboarding/status";
import { getGoogleRefreshToken } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/session-user";
import {
  fetchRuleLearningEntries,
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
  // 繰り返し予定の実体化はfetchSyncedEventsの直前に完了させる必要がある(P5-1)ため、
  // 読み取りの Promise.all より前に置く点は変えない。
  // redirect() は例外を投げるため Promise.all の中では呼ばず、解決後に判定する
  const [profileResult, recurringRules] = await Promise.all([
    supabase
      .from("profiles")
      .select("onboarded_at")
      .eq("id", sessionUser.id)
      .single(),
    materializeRecurringInstances(supabase, baseDate),
  ]);
  if (shouldRedirectToOnboarding(profileResult.data)) {
    redirect("/onboarding");
  }

  // 提案経由の定期予定の自動学習補正(P10-1)。origin='suggestion'のルールが1件もなければ
  // 実績の追加取得ごとスキップする。調整が実際にあった場合のみ再実体化し、
  // 今日以降のsynced_eventsを新しい値で作り直す(古い値のままにしない)
  const now = new Date();
  const hasSuggestionOriginRules = recurringRules.some(
    (rule) => rule.origin === "suggestion",
  );
  const ruleAdjustments = hasSuggestionOriginRules
    ? await applyRuleAdjustments(
        supabase,
        computeRuleAdjustments(
          recurringRules,
          await fetchRuleLearningEntries(supabase, now),
          now,
        ),
        now,
      )
    : [];
  // Next.jsのfetchリクエストメモ化により、recurring_rulesへ全く同じSELECTを
  // 同一レンダー内で再度投げても更新前の内容が返ってしまう。そのため再実体化は
  // DBを読み直さず、既知のルール一覧に今回の調整結果をマージした値を明示的に渡す
  const finalRecurringRules =
    ruleAdjustments.length > 0
      ? await materializeRecurringInstances(
          supabase,
          baseDate,
          undefined,
          recurringRules.map((rule) => {
            const notice = ruleAdjustments.find((n) => n.ruleId === rule.id);
            return notice
              ? {
                  ...rule,
                  startTime: notice.newStartTime,
                  endTime: notice.newEndTime,
                  lastLearnedAt: now.toISOString(),
                }
              : rule;
          }),
        )
      : recurringRules;

  const [events, timeEntries, runningEntry, tokenResult, suggestionEntries] =
    await Promise.all([
      fetchSyncedEvents(supabase, baseDate),
      fetchTimeEntries(supabase, baseDate),
      fetchRunningEntry(supabase),
      googleEnabled
        ? getGoogleRefreshToken(sessionUser.id)
        : Promise.resolve(null),
      fetchSuggestionSourceEntries(supabase, baseDate),
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
      />
    </main>
  );
}
