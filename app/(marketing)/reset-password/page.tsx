import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/reset-password-form";
import { AUTH_MESSAGES as M } from "@/lib/auth/messages";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "新しいパスワードの設定 | PlanDiff",
};

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-6 py-16">
        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-bold tracking-tight">
            {M.resetPasswordExpiredHeading}
          </h1>
          <p className="max-w-xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            {M.resetPasswordExpiredDescription}
          </p>
        </div>
        <Link href="/forgot-password" className="text-sm underline">
          {M.backToForgotPassword}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight">
          {M.resetPasswordHeading}
        </h1>
        <p className="max-w-xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          {M.resetPasswordDescription}
        </p>
      </div>
      <div className="max-w-sm">
        <ResetPasswordForm />
      </div>
    </div>
  );
}
