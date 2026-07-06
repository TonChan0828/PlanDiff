import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchPrimaryEvents } from "@/lib/google/calendar";

// 仕様書: docs/specs/P1-2_カレンダー同期.md S4 / S5 / S6 / S7

const fetchMock = vi.fn();

const TIME_MIN = "2026-06-29T00:00:00.000Z";
const TIME_MAX = "2026-07-20T00:00:00.000Z";

function jsonResponse(status: number, body: object): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function timedEvent(id: string, summary: string | undefined, day: string) {
  return {
    id,
    summary,
    start: { dateTime: `${day}T09:00:00+09:00` },
    end: { dateTime: `${day}T10:30:00+09:00` },
  };
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchPrimaryEvents", () => {
  it("S4: primaryカレンダーに singleEvents=true・期間付きでリクエストし、dateTimeをUTC ISOに正規化する", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        items: [timedEvent("ev-1", "設計レビュー", "2026-07-06")],
      }),
    );

    const result = await fetchPrimaryEvents("at-1", TIME_MIN, TIME_MAX);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [rawUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const url = new URL(rawUrl);
    expect(url.origin + url.pathname).toBe(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    );
    expect(url.searchParams.get("singleEvents")).toBe("true");
    expect(url.searchParams.get("timeMin")).toBe(TIME_MIN);
    expect(url.searchParams.get("timeMax")).toBe(TIME_MAX);
    expect(url.searchParams.get("maxResults")).toBe("2500");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer at-1");

    expect(result).toEqual({
      ok: true,
      events: [
        {
          googleEventId: "ev-1",
          title: "設計レビュー",
          startAt: "2026-07-06T00:00:00.000Z",
          endAt: "2026-07-06T01:30:00.000Z",
        },
      ],
    });
  });

  it("S5: nextPageToken がある場合は全ページを取得して結合する", async () => {
    fetchMock.mockImplementation((rawUrl: string) => {
      const pageToken = new URL(rawUrl).searchParams.get("pageToken");
      if (!pageToken) {
        return Promise.resolve(
          jsonResponse(200, {
            items: [timedEvent("ev-1", "1ページ目", "2026-07-06")],
            nextPageToken: "page-2",
          }),
        );
      }
      expect(pageToken).toBe("page-2");
      return Promise.resolve(
        jsonResponse(200, {
          items: [timedEvent("ev-2", "2ページ目", "2026-07-07")],
        }),
      );
    });

    const result = await fetchPrimaryEvents("at-1", TIME_MIN, TIME_MAX);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.events.map((event) => event.googleEventId)).toEqual([
        "ev-1",
        "ev-2",
      ]);
    }
  });

  it("S6: 終日イベントは除外され、タイトルなしは空文字列になる", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        items: [
          {
            id: "allday-1",
            summary: "夏季休暇",
            start: { date: "2026-07-06" },
            end: { date: "2026-07-07" },
          },
          timedEvent("ev-1", undefined, "2026-07-06"),
        ],
      }),
    );

    const result = await fetchPrimaryEvents("at-1", TIME_MIN, TIME_MAX);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.events).toHaveLength(1);
      expect(result.events[0]!.googleEventId).toBe("ev-1");
      expect(result.events[0]!.title).toBe("");
    }
  });

  it("S7: Calendar APIが401を返す場合は reason=reauthorize が返る", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, {
        error: { code: 401, message: "Invalid Credentials" },
      }),
    );
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = await fetchPrimaryEvents("at-1", TIME_MIN, TIME_MAX);

    expect(result).toEqual({ ok: false, reason: "reauthorize" });

    consoleErrorSpy.mockRestore();
  });
});
