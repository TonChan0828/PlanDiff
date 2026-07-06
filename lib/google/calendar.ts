import "server-only";
import { parseISO } from "date-fns";
import type { GoogleAuthFailureReason } from "@/lib/google/token";

// Google Calendar API(events.list)。プライマリカレンダーのみ・readonlyスコープ。
// 繰り返し予定は singleEvents=true でインスタンス展開して取得する。

export interface NormalizedGoogleEvent {
  googleEventId: string;
  title: string;
  /** UTCのISO文字列 */
  startAt: string;
  /** UTCのISO文字列 */
  endAt: string;
}

export type FetchPrimaryEventsResult =
  | { ok: true; events: NormalizedGoogleEvent[] }
  | { ok: false; reason: GoogleAuthFailureReason };

const EVENTS_ENDPOINT =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";

interface GoogleEventItem {
  id?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

export async function fetchPrimaryEvents(
  accessToken: string,
  timeMin: string,
  timeMax: string,
): Promise<FetchPrimaryEventsResult> {
  const events: NormalizedGoogleEvent[] = [];
  let pageToken: string | undefined;

  try {
    do {
      const url = new URL(EVENTS_ENDPOINT);
      url.searchParams.set("timeMin", timeMin);
      url.searchParams.set("timeMax", timeMax);
      url.searchParams.set("singleEvents", "true");
      url.searchParams.set("orderBy", "startTime");
      url.searchParams.set("maxResults", "2500");
      if (pageToken) {
        url.searchParams.set("pageToken", pageToken);
      }

      const response = await fetch(url.toString(), {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      if (response.status === 401) {
        return { ok: false, reason: "reauthorize" };
      }
      if (!response.ok) {
        console.error("カレンダー予定の取得に失敗しました:", response.status);
        return { ok: false, reason: "transient" };
      }

      const body = (await response.json()) as {
        items?: GoogleEventItem[];
        nextPageToken?: string;
      };
      for (const item of body.items ?? []) {
        // 終日イベント(start.date形式)はMVPでは同期対象外(仕様書 確認事項1)
        if (!item.id || !item.start?.dateTime || !item.end?.dateTime) {
          continue;
        }
        events.push({
          googleEventId: item.id,
          title: item.summary ?? "",
          startAt: parseISO(item.start.dateTime).toISOString(),
          endAt: parseISO(item.end.dateTime).toISOString(),
        });
      }
      pageToken = body.nextPageToken;
    } while (pageToken);

    return { ok: true, events };
  } catch (cause) {
    console.error(
      "カレンダー予定の取得に失敗しました:",
      cause instanceof Error ? cause.name : "unknown",
    );
    return { ok: false, reason: "transient" };
  }
}
