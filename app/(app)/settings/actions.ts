"use server";

import { redirect } from "next/navigation";
import {
  deleteGoogleRefreshToken,
  deleteUserAccount,
} from "@/lib/supabase/admin";
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

// アカウントとデータの全削除(仕様書P4-2 S4/S7/S8)。auth.users削除のcascadeで
// 全テーブルの行が消える。失敗時はセッションを維持したまま設定画面へ戻す(再試行可能にする)
export async function deleteAccountAction() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    redirect("/login");
  }
  const deleted = await deleteUserAccount(data.user.id);
  if (!deleted) {
    redirect("/settings?error=account_delete_failed");
  }
  await supabase.auth.signOut();
  redirect("/login?deleted=1");
}
