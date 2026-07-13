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
        <p className="text-ink-muted max-w-xl text-sm leading-relaxed">
          {M.loginDescription}
        </p>
      </div>
      {errorMessage && (
        <p
          role="alert"
          className="bg-danger/10 text-danger rounded-md px-4 py-3 text-sm"
        >
          {errorMessage}
        </p>
      )}
      {deleted === "1" && (
        <p
          role="status"
          className="bg-success/10 text-success rounded-md px-4 py-3 text-sm"
        >
          {M.accountDeleted}
        </p>
      )}
      {reset === "success" && (
        <p
          role="status"
          className="bg-success/10 text-success rounded-md px-4 py-3 text-sm"
        >
          {M.resetPasswordSuccess}
        </p>
      )}
      <div className="max-w-sm">
        <LoginForm />
      </div>
      <div className="flex flex-col text-sm">
        <Link
          href="/signup"
          className="inline-flex min-h-11 items-center underline"
        >
          {M.noAccountYet}
        </Link>
        <Link
          href="/forgot-password"
          className="inline-flex min-h-11 items-center underline"
        >
          {M.forgotPasswordLink}
        </Link>
      </div>
    </div>
  );
}
