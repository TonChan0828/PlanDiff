"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  startTimer,
  stopTimer,
  type StartTimerInput,
  type TimerResult,
} from "@/lib/timer/service";

// タイマー操作のServer Action(P2-2)。認証確認 → service → revalidate。
// Google APIは使わない。DB書き込みはここ(サーバー)のみ。

export async function startTimerAction(
  input: StartTimerInput,
): Promise<TimerResult> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    redirect("/login");
  }
  const result = await startTimer(supabase, input);
  if (result.ok) {
    revalidatePath("/calendar");
  }
  return result;
}

export async function stopTimerAction(): Promise<TimerResult> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    redirect("/login");
  }
  const result = await stopTimer(supabase);
  if (result.ok) {
    revalidatePath("/calendar");
  }
  return result;
}
