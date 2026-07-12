import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

// タイマー操作のコアロジック(P2-2)。Server Actionから呼ぶ。
// 時刻はすべてサーバー側で決定し、UTCで保存する。
// 実行中1本の保証はDBの partial unique index(one_running_timer_per_user)が最終防衛線。

export interface StartTimerInput {
  /** フリータイマー(P2-3)は null */
  googleEventId: string | null;
  /** 予定タイトルのスナップショット */
  title: string;
}

export type TimerResult = { ok: true } | { ok: false };

const UNIQUE_VIOLATION = "23505";

/** 実行中エントリがあれば停止する(なければ何もしない) */
async function stopRunning(
  client: SupabaseClient,
  endAtIso: string,
): Promise<boolean> {
  const { error } = await client
    .from("time_entries")
    .update({ end_at: endAtIso })
    .is("end_at", null);
  return !error;
}

export async function startTimer(
  client: SupabaseClient,
  input: StartTimerInput,
): Promise<TimerResult> {
  const { data: userData } = await client.auth.getUser();
  if (!userData.user) {
    return { ok: false };
  }

  // 競合(別デバイスの同時開始で unique index 違反)時は 停止→insert を1回だけリトライする
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const nowIso = new Date().toISOString();
    if (!(await stopRunning(client, nowIso))) {
      return { ok: false };
    }
    const { error } = await client.from("time_entries").insert({
      user_id: userData.user.id,
      title: input.title,
      google_event_id: input.googleEventId,
      start_at: nowIso,
      end_at: null,
    });
    if (!error) {
      return { ok: true };
    }
    if (error.code !== UNIQUE_VIOLATION) {
      return { ok: false };
    }
  }
  return { ok: false };
}

/** 実行中エントリを停止して実績として確定する。実行中がなければ何もせず成功(冪等) */
export async function stopTimer(client: SupabaseClient): Promise<TimerResult> {
  const stopped = await stopRunning(client, new Date().toISOString());
  return stopped ? { ok: true } : { ok: false };
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
  const { data: userData } = await client.auth.getUser();
  if (!userData.user) {
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
  const { data: userData } = await client.auth.getUser();
  if (!userData.user) {
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
  const { data: userData } = await client.auth.getUser();
  if (!userData.user) {
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
