import type { Metadata } from "next";
import { signOutAction } from "@/app/(app)/actions";
import {
  CalendarSync,
  type CalendarSyncEvent,
} from "@/components/calendar-sync";
import { computeSyncRange } from "@/lib/google/sync-range";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "カレンダー | PlanDiff",
};

const HEADING = "カレンダー";
const SIGN_OUT_LABEL = "ログアウト";

// キャッシュ済み予定の簡易リスト+同期(P1-2)。タイムライン表示の本実装はP2-1
export default async function CalendarPage() {
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

  // 週境界はサーバーのタイムゾーンでの概算(±1週のバッファがあるため簡易リストには十分)。
  // クライアント主導の週ナビゲーションはP2-1で実装する
  const range = computeSyncRange(new Date());
  const { data: eventRows } = await supabase
    .from("synced_events")
    .select("id, title, start_at, end_at")
    .lt("start_at", range.timeMax)
    .gt("end_at", range.timeMin)
    .order("start_at", { ascending: true });

  const events: CalendarSyncEvent[] = (eventRows ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    startAt: row.start_at,
    endAt: row.end_at,
  }));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">{HEADING}</h1>
        <form action={signOutAction}>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-zinc-300 px-6 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            {SIGN_OUT_LABEL}
          </button>
        </form>
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {displayName} さんとしてログイン中です。
      </p>
      <CalendarSync events={events} />
    </main>
  );
}
