import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "ログイン | PlanDiff",
};

// cookies()を呼ぶ前に環境変数チェックで例外を投げるとNext.jsの動的判定より先に
// ビルド時プリレンダリングが走ってしまうため、force-dynamicで明示する
export const dynamic = "force-dynamic";

const HEADING = "ログイン";
const DESCRIPTION =
  "Googleアカウントでログインして、カレンダーの予定と実績のギャップを可視化しましょう。";
const SIGN_IN_LABEL = "Googleでログイン";
const DEFAULT_ERROR_MESSAGE =
  "ログインに失敗しました。時間をおいてもう一度お試しください";
const ERROR_MESSAGES: Record<string, string> = {
  auth: "ログインがキャンセルされました。もう一度お試しください",
  failed: DEFAULT_ERROR_MESSAGE,
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) {
    redirect("/calendar");
  }

  const { error } = await searchParams;
  const errorMessage = error
    ? (ERROR_MESSAGES[error] ?? DEFAULT_ERROR_MESSAGE)
    : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight">{HEADING}</h1>
        <p className="max-w-xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          {DESCRIPTION}
        </p>
      </div>
      {errorMessage && (
        <p
          role="alert"
          className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {errorMessage}
        </p>
      )}
      <div className="max-w-xs">
        <GoogleSignInButton label={SIGN_IN_LABEL} />
      </div>
    </div>
  );
}
