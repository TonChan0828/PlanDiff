import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { AUTH_MESSAGES as M } from "@/lib/auth/messages";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "ログイン | PlanDiff",
};

// cookies()を呼ぶ前に環境変数チェックで例外を投げるとNext.jsの動的判定より先に
// ビルド時プリレンダリングが走ってしまうため、force-dynamicで明示する
export const dynamic = "force-dynamic";

const ERROR_MESSAGES: Record<string, string> = {
  confirm_failed: M.confirmFailedLogin,
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reset?: string; deleted?: string }>;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) {
    redirect("/calendar");
  }

  const { error, reset, deleted } = await searchParams;
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? null) : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight">{M.loginHeading}</h1>
        <p className="max-w-xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          {M.loginDescription}
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
      {deleted === "1" && (
        <p
          role="status"
          className="rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
        >
          {M.accountDeleted}
        </p>
      )}
      {reset === "success" && (
        <p
          role="status"
          className="rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
        >
          {M.resetPasswordSuccess}
        </p>
      )}
      <div className="max-w-sm">
        <LoginForm />
      </div>
      <div className="flex flex-col gap-1 text-sm">
        <Link href="/signup" className="underline">
          {M.noAccountYet}
        </Link>
        <Link href="/forgot-password" className="underline">
          {M.forgotPasswordLink}
        </Link>
      </div>
    </div>
  );
}
