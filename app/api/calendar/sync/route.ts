import { NextResponse, type NextRequest } from "next/server";
import { addDays, isAfter, isValid, parseISO } from "date-fns";
import { fetchPrimaryEvents } from "@/lib/google/calendar";
import { refreshAccessToken } from "@/lib/google/token";
import {
  deleteGoogleRefreshToken,
  getGoogleRefreshToken,
} from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// カレンダー同期(FR-02)。Google API呼び出しはこのRoute Handlerに集約する。
// synced_events の読み書きはユーザー自身のRLSクライアントで行い、
// service role は google_tokens の読み取り・削除のみに使う。

const MAX_RANGE_DAYS = 35;

interface SyncRange {
  timeMin: string;
  timeMax: string;
}

// 正規利用は「表示週 ± 1週間」の21日間。上限35日は乱用防止
function parseSyncRange(body: unknown): SyncRange | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const { timeMin, timeMax } = body as Record<string, unknown>;
  if (typeof timeMin !== "string" || typeof timeMax !== "string") {
    return null;
  }
  const min = parseISO(timeMin);
  const max = parseISO(timeMax);
  if (!isValid(min) || !isValid(max)) {
    return null;
  }
  if (min.getTime() >= max.getTime()) {
    return null;
  }
  if (isAfter(max, addDays(min, MAX_RANGE_DAYS))) {
    return null;
  }
  return { timeMin: min.toISOString(), timeMax: max.toISOString() };
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body: unknown = await request.json().catch(() => null);
  const range = parseSyncRange(body);
  if (!range) {
    return NextResponse.json({ error: "invalid_range" }, { status: 400 });
  }

  const tokenResult = await getGoogleRefreshToken(user.id);
  if (!tokenResult.ok) {
    return NextResponse.json({ error: "sync_failed" }, { status: 500 });
  }
  if (!tokenResult.refreshToken) {
    // Google未連携(一度も連携していない)。連携失効(reauthorize)とは区別する(仕様書P1-3)
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }

  const refreshed = await refreshAccessToken(tokenResult.refreshToken);
  if (!refreshed.ok) {
    if (refreshed.reason === "reauthorize") {
      // 失効したトークンは残さない(仕様書 確認事項2)。再認可でcallbackが再保存する
      await deleteGoogleRefreshToken(user.id);
      return NextResponse.json({ error: "reauthorize" }, { status: 401 });
    }
    return NextResponse.json({ error: "sync_failed" }, { status: 502 });
  }

  const fetched = await fetchPrimaryEvents(
    refreshed.accessToken,
    range.timeMin,
    range.timeMax,
  );
  if (!fetched.ok) {
    if (fetched.reason === "reauthorize") {
      await deleteGoogleRefreshToken(user.id);
      return NextResponse.json({ error: "reauthorize" }, { status: 401 });
    }
    return NextResponse.json({ error: "sync_failed" }, { status: 502 });
  }

  const syncedAt = new Date().toISOString();
  if (fetched.events.length > 0) {
    const { error: upsertError } = await supabase.from("synced_events").upsert(
      fetched.events.map((event) => ({
        user_id: user.id,
        google_event_id: event.googleEventId,
        title: event.title,
        start_at: event.startAt,
        end_at: event.endAt,
        synced_at: syncedAt,
      })),
      { onConflict: "user_id,google_event_id" },
    );
    if (upsertError) {
      console.error("synced_eventsの保存に失敗しました:", upsertError.code);
      return NextResponse.json({ error: "sync_failed" }, { status: 500 });
    }
  }

  // 期間内でGoogle側から消えた予定をキャッシュから削除する(期間外の行は触らない)。
  // 期間との重なり判定は start_at < timeMax AND end_at > timeMin
  const { data: cachedRows, error: cachedError } = await supabase
    .from("synced_events")
    .select("id, google_event_id")
    .lt("start_at", range.timeMax)
    .gt("end_at", range.timeMin);
  if (cachedError) {
    console.error("synced_eventsの読み取りに失敗しました:", cachedError.code);
    return NextResponse.json({ error: "sync_failed" }, { status: 500 });
  }
  const fetchedIds = new Set(
    fetched.events.map((event) => event.googleEventId),
  );
  const staleIds = (cachedRows ?? [])
    .filter((row) => !fetchedIds.has(row.google_event_id))
    .map((row) => row.id);
  if (staleIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("synced_events")
      .delete()
      .in("id", staleIds);
    if (deleteError) {
      console.error("synced_eventsの削除に失敗しました:", deleteError.code);
      return NextResponse.json({ error: "sync_failed" }, { status: 500 });
    }
  }

  const { data: rows, error: selectError } = await supabase
    .from("synced_events")
    .select("id, google_event_id, title, start_at, end_at")
    .lt("start_at", range.timeMax)
    .gt("end_at", range.timeMin)
    .order("start_at", { ascending: true });
  if (selectError) {
    console.error("synced_eventsの読み取りに失敗しました:", selectError.code);
    return NextResponse.json({ error: "sync_failed" }, { status: 500 });
  }

  return NextResponse.json({
    events: (rows ?? []).map((row) => ({
      id: row.id,
      googleEventId: row.google_event_id,
      title: row.title,
      startAt: row.start_at,
      endAt: row.end_at,
    })),
  });
}
