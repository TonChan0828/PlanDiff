"use server";

import { redirect } from "next/navigation";
import { deleteGoogleRefreshToken } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Googleカレンダー連携の解除(仕様書P1-3 S22)。google_tokensの行のみ削除し、
// アカウント(profiles/auth.users)には影響しない。
export async function disconnectGoogleAction() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    redirect("/login");
  }
  await deleteGoogleRefreshToken(data.user.id);
  redirect("/settings");
}
