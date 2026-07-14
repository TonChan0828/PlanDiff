import type { Metadata } from "next";
import { TrackView } from "@/components/track-view";
import { fetchSyncedEvents } from "@/lib/calendar/events";
import { materializeRecurringInstances } from "@/lib/calendar/recurring";
import { createClient } from "@/lib/supabase/server";
import { fetchRunningEntry, fetchTimeEntries } from "@/lib/timer/entries";
import { TRACK_MESSAGES as TR } from "@/lib/track/messages";

export const metadata: Metadata = {
  title: "計測 | PlanDiff",
};

// 計測画面(P2-6)。カレンダーを経由せずタイマー操作と当日実績の確認だけを行う。
// 予定・実績の取得は既存ヘルパー(今日を含む週±1週間)を再利用し、
// 「今日」「進行中」の絞り込みはユーザーTZが必要なためクライアント(TrackView)で行う。
export default async function TrackPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    // レイアウトで検証済みのため通常は到達しない
    return null;
  }

  const baseDate = new Date();
  // 繰り返し予定の実体化はfetchSyncedEventsの直前に完了させる必要があるため直列で実行する(P5-1)
  await materializeRecurringInstances(supabase, baseDate);
  const [events, timeEntries, runningEntry] = await Promise.all([
    fetchSyncedEvents(supabase, baseDate),
    fetchTimeEntries(supabase, baseDate),
    fetchRunningEntry(supabase),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-2xl font-bold tracking-tight">{TR.heading}</h1>
      <TrackView
        events={events}
        timeEntries={timeEntries}
        runningEntry={runningEntry}
      />
    </main>
  );
}
