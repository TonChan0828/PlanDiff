import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSessionUser } from "@/lib/supabase/session-user";

// タイマー操作のコアロジック(P2-2)。Server Actionから呼ぶ。
// 時刻はすべてDB側で決定し、UTCで保存する。
// 開始・停止は同一利用者のadvisory lockを取るRPCで直列化する。

export interface StartTimerInput {
  /** フリータイマー(P2-3)は null */
  googleEventId: string | null;
  /** 予定タイトルのスナップショット */
  title: string;
}

export type TimerResult = { ok: true } | { ok: false };

/** RPCのDBエラーや通信例外を、サービス層の失敗結果へ揃える */
async function callTimerRpc(
  client: SupabaseClient,
  name: "start_timer" | "stop_timer",
  args?: { p_title: string; p_google_event_id: string | null },
): Promise<TimerResult> {
  try {
    const { error } = args
      ? await client.rpc(name, args)
      : await client.rpc(name);
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}

export async function startTimer(
  client: SupabaseClient,
  input: StartTimerInput,
): Promise<TimerResult> {
  const sessionUser = await getSessionUser(client);
  if (!sessionUser) {
    return { ok: false };
  }

  // 停止とINSERTはDBの1トランザクションで行う。INSERT失敗時に既存計測も維持される。
  return callTimerRpc(client, "start_timer", {
    p_title: input.title,
    p_google_event_id: input.googleEventId,
  });
}

/** 実行中エントリを停止して実績として確定する。実行中がなければ何もせず成功(冪等) */
export async function stopTimer(client: SupabaseClient): Promise<TimerResult> {
  if (!(await getSessionUser(client))) {
    return { ok: false };
  }
  return callTimerRpc(client, "stop_timer");
}

export interface UpdateTimeEntryInput {
  title: string;
  /** UTCのISO文字列 */
  startAt: string;
  /** UTCのISO文字列 */
  endAt: string;
}

// 確定済み実績(end_at IS NOT NULL)のみが対象。実行中エントリはガード条件で除外し、
// 停止前に直接書き換えられないようにする(P2-4)。RLSにより他人の行は対象にならない。

/** 確定済み実績のタイトル・開始/終了時刻を更新する。実行中エントリは対象外 */
export async function updateTimeEntry(
  client: SupabaseClient,
  id: string,
  input: UpdateTimeEntryInput,
): Promise<TimerResult> {
  const sessionUser = await getSessionUser(client);
  if (!sessionUser) {
    return { ok: false };
  }
  const { data, error } = await client
    .from("time_entries")
    .update({
      title: input.title,
      start_at: input.startAt,
      end_at: input.endAt,
    })
    .eq("id", id)
    .not("end_at", "is", null)
    .select("id");
  if (error || !data || data.length === 0) {
    return { ok: false };
  }
  return { ok: true };
}

// 時計ズレ許容: クライアントの「今」がサーバーよりわずかに進んでいても拒否しない(D-4)
const START_AT_FUTURE_TOLERANCE_MS = 60 * 1000;

/** 実行中エントリ(end_at IS NULL)の開始時刻を変更する。確定済み実績は対象外(D-4) */
export async function updateRunningStart(
  client: SupabaseClient,
  startAtIso: string,
): Promise<TimerResult> {
  const sessionUser = await getSessionUser(client);
  if (!sessionUser) {
    return { ok: false };
  }
  const startAtMs = Date.parse(startAtIso);
  if (
    Number.isNaN(startAtMs) ||
    startAtMs > Date.now() + START_AT_FUTURE_TOLERANCE_MS
  ) {
    return { ok: false };
  }
  const { data, error } = await client
    .from("time_entries")
    .update({ start_at: new Date(startAtMs).toISOString() })
    .is("end_at", null)
    .select("id");
  if (error || !data || data.length === 0) {
    return { ok: false };
  }
  return { ok: true };
}

/** 確定済み実績を削除する。実行中エントリは対象外 */
export async function deleteTimeEntry(
  client: SupabaseClient,
  id: string,
): Promise<TimerResult> {
  const sessionUser = await getSessionUser(client);
  if (!sessionUser) {
    return { ok: false };
  }
  const { data, error } = await client
    .from("time_entries")
    .delete()
    .eq("id", id)
    .not("end_at", "is", null)
    .select("id");
  if (error || !data || data.length === 0) {
    return { ok: false };
  }
  return { ok: true };
}
