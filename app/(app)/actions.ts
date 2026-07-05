"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// ログアウト。google_tokens の行は削除しない(再ログインで再利用。削除はP4-2のデータ全削除で行う)
export async function signOutAction() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error("ログアウトに失敗しました:", error.name);
  }
  redirect("/login");
}
