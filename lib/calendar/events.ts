import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { computeSyncRange } from "@/lib/google/sync-range";

// page(Server Component)用の synced_events 読み取りヘルパー(P2-1)。
// 期間は「基準日を含む週 ± 1週間」(FR-02と同じ)。RLSにより本人の行のみ返る。

export interface SyncedEvent {
  id: string;
  title: string;
  /** UTCのISO文字列 */
  startAt: string;
  /** UTCのISO文字列 */
  endAt: string;
}

export async function fetchSyncedEvents(
  client: SupabaseClient,
  baseDate: Date,
): Promise<SyncedEvent[]> {
  const range = computeSyncRange(baseDate);
  const { data, error } = await client
    .from("synced_events")
    .select("id, title, start_at, end_at")
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
    title: row.title as string,
    startAt: new Date(row.start_at as string).toISOString(),
    endAt: new Date(row.end_at as string).toISOString(),
  }));
}
