import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, startOfWeek } from "date-fns";
import { computeSyncRange } from "@/lib/google/sync-range";
import type { RunningEntry, TimeEntryItem } from "@/lib/timer/types";

// page(Server Component)用の time_entries 読み取りヘルパー(P2-2)。
// RLSにより本人の行のみ返る。

/** 確定済み実績(end_at NOT NULL)を「基準日を含む週 ± 1週間」で取得する */
export async function fetchTimeEntries(
  client: SupabaseClient,
  baseDate: Date,
): Promise<TimeEntryItem[]> {
  const range = computeSyncRange(baseDate);
  const { data, error } = await client
    .from("time_entries")
    .select("id, title, google_event_id, start_at, end_at")
    .not("end_at", "is", null)
    .lt("start_at", range.timeMax)
    .gt("end_at", range.timeMin)
    .order("start_at", { ascending: true });
  if (error) {
    // 詳細(接続情報等)をユーザー向けに漏らさない
    throw new Error("実績の読み込みに失敗しました");
  }
  // Postgresの「+00:00」表記を「Z」のUTC ISOへ正規化して返す
  return (data ?? []).map((row) => ({
    id: row.id as string,
    title: row.title as string,
    googleEventId: (row.google_event_id as string | null) ?? null,
    startAt: new Date(row.start_at as string).toISOString(),
    endAt: new Date(row.end_at as string).toISOString(),
  }));
}

/**
 * 実績からの予定提案(P5-2)の元データ。完了済み実績を
 * 「基準日を含む週の開始 − 4週間 − 1日」〜「週の開始 + 1日」で取得する。
 * 週境界の厳密なフィルタはクライアントの computeSuggestions がローカルTZで行うため、
 * ここでの±1日はTZ差を吸収するバッファ(computeSyncRange と同じ考え方)。
 * 取得失敗時は空配列を返し、提案セクションを出さないだけに留める(カレンダー本体を妨げない)。
 */
export async function fetchSuggestionSourceEntries(
  client: SupabaseClient,
  baseDate: Date,
): Promise<TimeEntryItem[]> {
  const weekStart = startOfWeek(baseDate, { weekStartsOn: 1 });
  const timeMin = addDays(weekStart, -29).toISOString();
  const timeMax = addDays(weekStart, 1).toISOString();
  const { data, error } = await client
    .from("time_entries")
    .select("id, title, google_event_id, start_at, end_at")
    .not("end_at", "is", null)
    .gte("start_at", timeMin)
    .lt("start_at", timeMax)
    .order("start_at", { ascending: true });
  if (error) {
    return [];
  }
  return (data ?? []).map((row) => ({
    id: row.id as string,
    title: row.title as string,
    googleEventId: (row.google_event_id as string | null) ?? null,
    startAt: new Date(row.start_at as string).toISOString(),
    endAt: new Date(row.end_at as string).toISOString(),
  }));
}

/** 実行中タイマー(end_at IS NULL)。期間に関係なく最大1件(partial unique indexで保証) */
export async function fetchRunningEntry(
  client: SupabaseClient,
): Promise<RunningEntry | null> {
  const { data, error } = await client
    .from("time_entries")
    .select("id, title, google_event_id, start_at")
    .is("end_at", null)
    .maybeSingle();
  if (error) {
    throw new Error("実行中タイマーの読み込みに失敗しました");
  }
  if (!data) {
    return null;
  }
  return {
    id: data.id as string,
    title: data.title as string,
    googleEventId: (data.google_event_id as string | null) ?? null,
    startAt: new Date(data.start_at as string).toISOString(),
  };
}
