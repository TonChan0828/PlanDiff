import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignupForm } from "@/components/signup-form";
import { AUTH_MESSAGES as M } from "@/lib/auth/messages";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "アカウント作成 | PlanDiff",
};

export const dynamic = "force-dynamic";

export default async function SignupPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) {
    redirect("/calendar");
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight">{M.signupHeading}</h1>
        <p className="text-ink-muted max-w-xl text-sm leading-relaxed">
          {M.signupDescription}
        </p>
      </div>
      <div className="max-w-sm">
        <SignupForm />
      </div>
      <Link
        href="/login"
        className="inline-flex min-h-11 items-center self-start text-sm underline"
      >
        {M.signupHaveAccount}
      </Link>
    </div>
  );
}
