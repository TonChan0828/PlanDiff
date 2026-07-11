"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createAppEvent,
  deleteAppEvent,
  updateAppEvent,
  type AppEventInput,
  type AppEventResult,
} from "@/lib/calendar/app-events";
import { createClient } from "@/lib/supabase/server";

// アプリ内予定のServer Action(P2-5)。認証確認 → lib/calendar/app-events → revalidate。
// timer-actions.ts と同じパターン。DB書き込みはユーザー本人のRLSクライアントのみ。

export async function createAppEventAction(
  input: AppEventInput,
): Promise<AppEventResult> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    redirect("/login");
  }
  const result = await createAppEvent(supabase, input);
  if (result.ok) {
    revalidatePath("/calendar");
    revalidatePath("/track");
  }
  return result;
}

export async function updateAppEventAction(
  id: string,
  input: AppEventInput,
): Promise<AppEventResult> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    redirect("/login");
  }
  const result = await updateAppEvent(supabase, id, input);
  if (result.ok) {
    revalidatePath("/calendar");
    revalidatePath("/track");
  }
  return result;
}

export async function deleteAppEventAction(
  id: string,
): Promise<AppEventResult> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    redirect("/login");
  }
  const result = await deleteAppEvent(supabase, id);
  if (result.ok) {
    revalidatePath("/calendar");
    revalidatePath("/track");
  }
  return result;
}
