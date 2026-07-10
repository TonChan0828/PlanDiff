import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { computeSyncRange } from "@/lib/google/sync-range";

// page(Server Component)用の synced_events 読み取りヘルパー(P2-1)。
// 期間は「基準日を含む週 ± 1週間」(FR-02と同じ)。RLSにより本人の行のみ返る。

export interface SyncedEvent {
  id: string;
  /** タイマー(P2-2)が time_entries と紐づける予定キー(Google予定ID or "app:<uuid>") */
  googleEventId: string;
  title: string;
  /** UTCのISO文字列 */
  startAt: string;
  /** UTCのISO文字列 */
  endAt: string;
  /** 予定の由来。'app' はアプリ内作成(編集・削除可。P2-5) */
  source: "google" | "app";
}

export async function fetchSyncedEvents(
  client: SupabaseClient,
  baseDate: Date,
): Promise<SyncedEvent[]> {
  const range = computeSyncRange(baseDate);
  const { data, error } = await client
    .from("synced_events")
    .select("id, google_event_id, title, start_at, end_at, source")
    .lt("start_at", range.timeMax)
    .gt("end_at", range.timeMin)
    .order("start_at", { ascending: true });
  if (error) {
    // 詳細(接続情報等)をユーザー向けに漏らさない
    throw new Error("予定の読み込みに失敗しました");
  }
  // Postgresの「+00:00」表記を「Z」のUTC ISOへ正規化して返す
  return (data ?? []).map((row) => ({
    id: row.id as string,
    googleEventId: row.google_event_id as string,
    title: row.title as string,
    startAt: new Date(row.start_at as string).toISOString(),
    endAt: new Date(row.end_at as string).toISOString(),
    source: row.source === "app" ? "app" : "google",
  }));
}
