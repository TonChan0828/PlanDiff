import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { AUTH_MESSAGES as M } from "@/lib/auth/messages";

export const metadata: Metadata = {
  title: "パスワード再設定 | PlanDiff",
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight">
          {M.forgotPasswordHeading}
        </h1>
        <p className="max-w-xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          {M.forgotPasswordDescription}
        </p>
      </div>
      {error === "expired" && (
        <p
          role="alert"
          className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {M.forgotPasswordExpiredLink}
        </p>
      )}
      <div className="max-w-sm">
        <ForgotPasswordForm />
      </div>
      <Link href="/login" className="text-sm underline">
        {M.loginHeading}
      </Link>
    </div>
  );
}
