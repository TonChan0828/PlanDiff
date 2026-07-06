import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { POST } from "@/app/api/calendar/sync/route";
import { createClient } from "@/lib/supabase/server";
import {
  createAdminClient,
  createAnonClient,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "./helpers";

// 仕様書: docs/specs/P1-2_カレンダー同期.md S9〜S15 / S17
// Google API(token endpoint / events.list)は fetch レベルでモックし、
// synced_events / google_tokens への効果はローカルSupabaseで実際に検証する。

const TIME_MIN = "2026-07-06T00:00:00.000Z";
const TIME_MAX = "2026-07-20T00:00:00.000Z";

const admin = createAdminClient();
let userA: TestUser;
let userB: TestUser;

// --- Google API モック(それ以外のURLは実fetchへ委譲し、ローカルSupabase通信を妨げない) ---

interface MockedResponse {
  status: number;
  body: object;
}

let tokenResponse: MockedResponse;
let eventsResponse: MockedResponse;
const googleCalls: string[] = [];

const realFetch = globalThis.fetch;

function googleEvent(
  id: string,
  summary: string,
  startIso: string,
  endIso: string,
) {
  return {
    id,
    summary,
    start: { dateTime: startIso },
    end: { dateTime: endIso },
  };
}

function mockClient(user: TestUser | SupabaseClient) {
  const client = "client" in user ? user.client : user;
  vi.mocked(createClient).mockResolvedValue(
    client as unknown as Awaited<ReturnType<typeof createClient>>,
  );
}

function callSync(body: unknown = { timeMin: TIME_MIN, timeMax: TIME_MAX }) {
  return POST(
    new NextRequest("http://localhost:3000/api/calendar/sync", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
  );
}

async function seedToken(user: TestUser, refreshToken = "rt-valid") {
  const { error } = await admin
    .from("google_tokens")
    .upsert({ user_id: user.id, refresh_token: refreshToken });
  expect(error).toBeNull();
}

async function seedCachedEvent(
  user: TestUser,
  googleEventId: string,
  startAt: string,
  endAt: string,
  title = "キャッシュ済み",
  syncedAt = "2026-07-01T00:00:00.000Z",
) {
  const { error } = await user.client.from("synced_events").insert({
    user_id: user.id,
    google_event_id: googleEventId,
    title,
    start_at: startAt,
    end_at: endAt,
    synced_at: syncedAt,
  });
  expect(error).toBeNull();
}

async function fetchCachedRows(user: TestUser) {
  const { data, error } = await user.client
    .from("synced_events")
    .select("google_event_id, title, start_at, end_at, synced_at")
    .order("start_at", { ascending: true });
  expect(error).toBeNull();
  return data ?? [];
}

beforeAll(async () => {
  vi.stubEnv("GOOGLE_CLIENT_ID", "it-client-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "it-client-secret");
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      googleCalls.push("token");
      return Promise.resolve(
        new Response(JSON.stringify(tokenResponse.body), {
          status: tokenResponse.status,
          headers: { "content-type": "application/json" },
        }),
      );
    }
    if (url.startsWith("https://www.googleapis.com/calendar/")) {
      googleCalls.push("events");
      return Promise.resolve(
        new Response(JSON.stringify(eventsResponse.body), {
          status: eventsResponse.status,
          headers: { "content-type": "application/json" },
        }),
      );
    }
    return realFetch(input, init);
  });

  userA = await createTestUser(admin, "同期テストA");
  userB = await createTestUser(admin, "同期テストB");
});

afterAll(async () => {
  await deleteTestUser(admin, userA.id);
  await deleteTestUser(admin, userB.id);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  vi.mocked(createClient).mockReset();
  mockClient(userA);
  tokenResponse = { status: 200, body: { access_token: "it-access-token" } };
  eventsResponse = { status: 200, body: { items: [] } };
  googleCalls.length = 0;

  // 前テストの残骸を掃除(usersのキャッシュ行・トークン行)
  for (const user of [userA, userB]) {
    await user.client
      .from("synced_events")
      .delete()
      .gte("synced_at", "1970-01-01T00:00:00Z");
    await admin.from("google_tokens").delete().eq("user_id", user.id);
  }
});

describe("POST /api/calendar/sync(結合)", () => {
  it("S9: 取得した予定が synced_events に保存され、200で start_at 昇順の events が返る", async () => {
    await seedToken(userA);
    eventsResponse = {
      status: 200,
      body: {
        items: [
          // 順不同で返しても昇順に整列されることを確認する
          googleEvent(
            "ev-2",
            "リリース作業",
            "2026-07-07T14:00:00+09:00",
            "2026-07-07T15:00:00+09:00",
          ),
          googleEvent(
            "ev-1",
            "朝会",
            "2026-07-06T09:00:00+09:00",
            "2026-07-06T09:15:00+09:00",
          ),
        ],
      },
    };

    const before = Date.now();
    const response = await callSync();

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.events).toHaveLength(2);
    expect(
      json.events.map((e: { googleEventId: string }) => e.googleEventId),
    ).toEqual(["ev-1", "ev-2"]);
    expect(json.events[0].title).toBe("朝会");
    expect(new Date(json.events[0].startAt).toISOString()).toBe(
      "2026-07-06T00:00:00.000Z",
    );

    const rows = await fetchCachedRows(userA);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.google_event_id).toBe("ev-1");
    expect(new Date(rows[0]!.start_at).toISOString()).toBe(
      "2026-07-06T00:00:00.000Z",
    );
    expect(new Date(rows[0]!.synced_at).getTime()).toBeGreaterThanOrEqual(
      before - 1000,
    );
  });

  it("S10: 同じ google_event_id の行は upsert で更新され、行数は増えない", async () => {
    await seedToken(userA);
    await seedCachedEvent(
      userA,
      "ev-1",
      "2026-07-06T01:00:00.000Z",
      "2026-07-06T02:00:00.000Z",
      "旧タイトル",
    );
    eventsResponse = {
      status: 200,
      body: {
        items: [
          googleEvent(
            "ev-1",
            "新タイトル",
            "2026-07-06T12:00:00+09:00",
            "2026-07-06T13:00:00+09:00",
          ),
        ],
      },
    };

    const response = await callSync();

    expect(response.status).toBe(200);
    const rows = await fetchCachedRows(userA);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe("新タイトル");
    expect(new Date(rows[0]!.start_at).toISOString()).toBe(
      "2026-07-06T03:00:00.000Z",
    );
    expect(new Date(rows[0]!.synced_at).getTime()).toBeGreaterThan(
      new Date("2026-07-01T00:00:00.000Z").getTime(),
    );
  });

  it("S11: 期間内でGoogle側から消えた行は削除され、期間外の行は残る", async () => {
    await seedToken(userA);
    await seedCachedEvent(
      userA,
      "gone-1",
      "2026-07-07T01:00:00.000Z",
      "2026-07-07T02:00:00.000Z",
    );
    await seedCachedEvent(
      userA,
      "outside-1",
      "2026-06-01T00:00:00.000Z",
      "2026-06-01T01:00:00.000Z",
    );
    eventsResponse = {
      status: 200,
      body: {
        items: [
          googleEvent(
            "keep-1",
            "残る予定",
            "2026-07-08T09:00:00+09:00",
            "2026-07-08T10:00:00+09:00",
          ),
        ],
      },
    };

    const response = await callSync();

    expect(response.status).toBe(200);
    const rows = await fetchCachedRows(userA);
    expect(rows.map((row) => row.google_event_id).sort()).toEqual([
      "keep-1",
      "outside-1",
    ]);
  });

  it("S12: 未ログインの場合は 401 unauthorized が返り、Google APIは呼ばれない", async () => {
    mockClient(createAnonClient());

    const response = await callSync();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(googleCalls).toEqual([]);
  });

  it("S13: google_tokens に行がない場合は 401 reauthorize が返り、Google APIは呼ばれない", async () => {
    const response = await callSync();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "reauthorize" });
    expect(googleCalls).toEqual([]);
  });

  it("S14: refresh token が invalid_grant の場合は 401 reauthorize が返り、google_tokens の行が削除される", async () => {
    await seedToken(userA, "rt-revoked");
    tokenResponse = { status: 400, body: { error: "invalid_grant" } };
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const response = await callSync();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "reauthorize" });
    const { data: tokenRows } = await admin
      .from("google_tokens")
      .select("user_id")
      .eq("user_id", userA.id);
    expect(tokenRows).toEqual([]);

    consoleErrorSpy.mockRestore();
  });

  it("S15: Calendar APIが5xxの場合は 502 sync_failed が返り、キャッシュは変更されない", async () => {
    await seedToken(userA);
    await seedCachedEvent(
      userA,
      "cached-1",
      "2026-07-07T01:00:00.000Z",
      "2026-07-07T02:00:00.000Z",
    );
    eventsResponse = { status: 500, body: {} };
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const response = await callSync();

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "sync_failed" });
    const rows = await fetchCachedRows(userA);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.google_event_id).toBe("cached-1");

    consoleErrorSpy.mockRestore();
  });

  it("S17: 同期しても別ユーザーのキャッシュ行は削除・変更されない", async () => {
    await seedToken(userA);
    await seedCachedEvent(
      userA,
      "a-gone",
      "2026-07-07T01:00:00.000Z",
      "2026-07-07T02:00:00.000Z",
    );
    await seedCachedEvent(
      userB,
      "b-ev",
      "2026-07-07T01:00:00.000Z",
      "2026-07-07T02:00:00.000Z",
      "Bの予定",
    );
    eventsResponse = { status: 200, body: { items: [] } };

    const response = await callSync();

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.events).toEqual([]);

    const rowsA = await fetchCachedRows(userA);
    expect(rowsA).toEqual([]);
    const rowsB = await fetchCachedRows(userB);
    expect(rowsB).toHaveLength(1);
    expect(rowsB[0]!.google_event_id).toBe("b-ev");
    expect(rowsB[0]!.title).toBe("Bの予定");
  });
});
