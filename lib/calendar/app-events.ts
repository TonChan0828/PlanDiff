import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

// アプリ内予定(P2-5)のCRUDロジック。Server Actionから呼ぶ。
// アプリ予定は synced_events に source='app'・google_event_id='app:<uuid>' で保存し、
// time_entries との紐づけ(google_event_id 文字列)は既存のまま機能させる。
// source='google' の行(Googleキャッシュ)は読み取り専用: update/delete はsourceガードで弾く。

export const APP_EVENT_ID_PREFIX = "app:";
const MAX_TITLE_LENGTH = 200;

export interface AppEventInput {
  title: string;
  /** UTCのISO文字列 */
  startAt: string;
  /** UTCのISO文字列 */
  endAt: string;
}

export type AppEventResult = { ok: true } | { ok: false };

interface ValidatedAppEvent {
  title: string;
  startAtIso: string;
  endAtIso: string;
}

function validate(input: AppEventInput): ValidatedAppEvent | null {
  const title = input.title.trim();
  if (title.length === 0 || title.length > MAX_TITLE_LENGTH) {
    return null;
  }
  const start = new Date(input.startAt);
  const end = new Date(input.endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }
  // ゼロ長の予定は計画として意味を持たないため、開始 < 終了を厳密に要求する
  if (start.getTime() >= end.getTime()) {
    return null;
  }
  return {
    title,
    startAtIso: start.toISOString(),
    endAtIso: end.toISOString(),
  };
}

export async function createAppEvent(
  client: SupabaseClient,
  input: AppEventInput,
): Promise<AppEventResult> {
  const { data: userData } = await client.auth.getUser();
  if (!userData.user) {
    return { ok: false };
  }
  const validated = validate(input);
  if (!validated) {
    return { ok: false };
  }
  const { error } = await client.from("synced_events").insert({
    user_id: userData.user.id,
    source: "app",
    google_event_id: `${APP_EVENT_ID_PREFIX}${crypto.randomUUID()}`,
    title: validated.title,
    start_at: validated.startAtIso,
    end_at: validated.endAtIso,
  });
  return error ? { ok: false } : { ok: true };
}

export async function updateAppEvent(
  client: SupabaseClient,
  id: string,
  input: AppEventInput,
): Promise<AppEventResult> {
  const { data: userData } = await client.auth.getUser();
  if (!userData.user) {
    return { ok: false };
  }
  const validated = validate(input);
  if (!validated) {
    return { ok: false };
  }
  const { data, error } = await client
    .from("synced_events")
    .update({
      title: validated.title,
      start_at: validated.startAtIso,
      end_at: validated.endAtIso,
      synced_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("source", "app")
    .select("id");
  if (error || !data || data.length === 0) {
    return { ok: false };
  }
  return { ok: true };
}

export async function deleteAppEvent(
  client: SupabaseClient,
  id: string,
): Promise<AppEventResult> {
  const { data: userData } = await client.auth.getUser();
  if (!userData.user) {
    return { ok: false };
  }
  // 紐づく time_entries は削除しない(サマリー上は割り込み実績扱いになる。仕様書P2-5)
  const { data, error } = await client
    .from("synced_events")
    .delete()
    .eq("id", id)
    .eq("source", "app")
    .select("id");
  if (error || !data || data.length === 0) {
    return { ok: false };
  }
  return { ok: true };
}
