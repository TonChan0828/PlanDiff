"use server";

import { redirect } from "next/navigation";
import { markOnboardingComplete } from "@/lib/onboarding/complete";
import { createClient } from "@/lib/supabase/server";

// オンボーディング完了(仕様書P4-1 S5・S8)。「はじめる」「スキップ」共通で呼ぶ
export async function completeOnboardingAction() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    redirect("/login");
  }
  const ok = await markOnboardingComplete(supabase, data.user.id);
  if (!ok) {
    redirect("/onboarding?error=save_failed");
  }
  redirect("/calendar");
}
