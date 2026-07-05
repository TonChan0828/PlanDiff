import type { Metadata } from "next";
import { signOutAction } from "@/app/(app)/actions";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "カレンダー | PlanDiff",
};

const HEADING = "カレンダー";
const PLACEHOLDER_NOTE = "カレンダー表示は準備中です(P2-1で実装予定)。";
const SIGN_OUT_LABEL = "ログアウト";

// ログイン確認用プレースホルダー(本実装はP2-1)
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

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <h1 className="text-2xl font-bold tracking-tight">{HEADING}</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {displayName} さんとしてログイン中です。{PLACEHOLDER_NOTE}
      </p>
      <form action={signOutAction}>
        <button
          type="submit"
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-zinc-300 px-6 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          {SIGN_OUT_LABEL}
        </button>
      </form>
    </main>
  );
}
