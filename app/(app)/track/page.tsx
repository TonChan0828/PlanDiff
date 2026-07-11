import type { Metadata } from "next";
import Link from "next/link";
import { TrackView } from "@/components/track-view";
import { fetchSyncedEvents } from "@/lib/calendar/events";
import { CALENDAR_MESSAGES } from "@/lib/calendar/messages";
import { SUMMARY_MESSAGES } from "@/lib/summary/messages";
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
  const [events, timeEntries, runningEntry] = await Promise.all([
    fetchSyncedEvents(supabase, baseDate),
    fetchTimeEntries(supabase, baseDate),
    fetchRunningEntry(supabase),
  ]);

  const navLinkClassName =
    "inline-flex min-h-11 items-center justify-center rounded-full border border-zinc-300 px-4 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800";

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{TR.heading}</h1>
        <div className="flex items-center gap-2">
          <Link href="/calendar" className={navLinkClassName}>
            {TR.calendarLink}
          </Link>
          <Link href="/summary" className={navLinkClassName}>
            {SUMMARY_MESSAGES.summaryLink}
          </Link>
          <Link href="/settings" className={navLinkClassName}>
            {CALENDAR_MESSAGES.settingsLink}
          </Link>
        </div>
      </div>
      <TrackView
        events={events}
        timeEntries={timeEntries}
        runningEntry={runningEntry}
      />
    </main>
  );
}
