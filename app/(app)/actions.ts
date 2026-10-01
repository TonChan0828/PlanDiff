"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { deletePushSubscriptionForUser } from "@/lib/notifications/store";
import { DEVICE_SUBSCRIPTION_COOKIE } from "@/lib/notifications/device-cookie";
import { getSessionUser } from "@/lib/supabase/session-user";

// ログアウト。google_tokens の行は削除しない(再ログインで再利用。削除はP4-2のデータ全削除で行う)
export async function signOutAction() {
  const supabase = await createClient();
  const cookieStore = await cookies();
  const subscriptionId = cookieStore.get(DEVICE_SUBSCRIPTION_COOKIE)?.value;

  if (subscriptionId) {
    const user = await getSessionUser(supabase);
    if (user) {
      try {
        await deletePushSubscriptionForUser(subscriptionId, user.id);
      } catch {
        // Keep both the session and the device cookie so the user can retry.
        redirect("/settings?error=notification_logout_failed");
      }
    }
  }
  cookieStore.delete(DEVICE_SUBSCRIPTION_COOKIE);

  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error("auth.sign_out_failed", error.name);
  }
  redirect("/login");
}
