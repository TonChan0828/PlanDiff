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

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { POST as syncPost } from "@/app/api/calendar/sync/route";
import { GET as connectGet } from "@/app/api/google/connect/route";
import { GET as callbackGet } from "@/app/api/google/callback/route";
import { createClient } from "@/lib/supabase/server";
import {
  createAdminClient,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "./helpers";

// 仕様書: docs/specs/P2-5_アプリ内予定とGoogle連携凍結.md S20
// 凍結フラグOFF(未設定含む)時、Google連携系エンドポイントは404を返し、DBに変更が生じない

const admin = createAdminClient();
let userA: TestUser;

const googleCalls: string[] = [];
const realFetch = globalThis.fetch;

beforeAll(async () => {
  userA = await createTestUser(admin, "凍結テスト");
  // Google APIへの到達を検知する(凍結中は一切呼ばれないはず)
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    if (url.includes("googleapis.com") || url.includes("google.com")) {
      googleCalls.push(url);
      return Promise.resolve(new Response("{}", { status: 500 }));
    }
    return realFetch(input, init);
  });
});

afterAll(async () => {
  await deleteTestUser(admin, userA.id);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  // 未設定=凍結を明示的に再現する
  vi.stubEnv("GOOGLE_INTEGRATION_ENABLED", "");
  vi.mocked(createClient).mockResolvedValue(
    userA.client as unknown as Awaited<ReturnType<typeof createClient>>,
  );
  googleCalls.length = 0;

  await admin.from("synced_events").delete().eq("user_id", userA.id);
  await admin
    .from("google_tokens")
    .upsert({ user_id: userA.id, refresh_token: "rt-frozen" });
  const { error } = await userA.client.from("synced_events").insert({
    user_id: userA.id,
    google_event_id: "g-frozen-1",
    title: "凍結前の同期キャッシュ",
    start_at: "2026-07-08T01:00:00.000Z",
    end_at: "2026-07-08T02:00:00.000Z",
  });
  expect(error).toBeNull();
});

async function fetchState() {
  const { data: tokens } = await admin
    .from("google_tokens")
    .select("refresh_token")
    .eq("user_id", userA.id);
  const { data: events } = await admin
    .from("synced_events")
    .select("google_event_id, title")
    .eq("user_id", userA.id);
  return { tokens, events };
}

describe("Google凍結フラグOFF時のエンドポイント(S20)", () => {
  it("S20: /api/calendar/sync は404を返し、キャッシュ・トークン・Google APIに変更/到達がない", async () => {
    const response = await syncPost(
      new NextRequest("http://localhost:3000/api/calendar/sync", {
        method: "POST",
        body: JSON.stringify({
          timeMin: "2026-07-06T00:00:00.000Z",
          timeMax: "2026-07-20T00:00:00.000Z",
        }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(response.status).toBe(404);
    const { tokens, events } = await fetchState();
    expect(tokens).toEqual([{ refresh_token: "rt-frozen" }]);
    expect(events).toHaveLength(1);
    expect(googleCalls).toEqual([]);
  });

  it("S20: /api/google/connect は404を返し、Google認可URLへリダイレクトしない", async () => {
    const response = await connectGet(
      new NextRequest("http://localhost:3000/api/google/connect"),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("location")).toBeNull();
  });

  it("S20: /api/google/callback は404を返し、google_tokensが変更されない", async () => {
    const headers = new Headers();
    headers.set("cookie", "google_oauth_state=s1");
    const response = await callbackGet(
      new NextRequest(
        "http://localhost:3000/api/google/callback?state=s1&code=abc",
        { headers },
      ),
    );

    expect(response.status).toBe(404);
    const { tokens } = await fetchState();
    expect(tokens).toEqual([{ refresh_token: "rt-frozen" }]);
    expect(googleCalls).toEqual([]);
  });
});
