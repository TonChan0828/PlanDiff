import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

// P4-1: オンボーディング完了をprofiles.onboarded_atに記録する。
// 認証ユーザー自身のクライアント(RLS)経由で呼ぶこと。.select("id")で
// 更新行数を確認し、RLSに阻まれた場合(0行)は失敗として扱う
export async function markOnboardingComplete(
  client: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("profiles")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("id", userId)
    .select("id");
  return !error && data !== null && data.length > 0;
}
