import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { GET } from "@/app/api/google/callback/route";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, createTestUser, deleteTestUser } from "./helpers";

// 仕様書: docs/specs/P1-3_メール認証とGoogle任意連携.md S19 / S20
// Googleのtoken endpoint(fetch境界)のみモックし、google_tokensへの保存は
// ローカルSupabase(service role)で実際に検証する。

const admin = createAdminClient();
const createdUserIds: string[] = [];
const originalFetch = globalThis.fetch;
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
let tokenResponse: Response | null = null;

function mockLoggedInUser(userId: string) {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } } }),
    },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

function jsonResponse(status: number, body: object): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Googleのtoken endpointへのリクエストのみ差し替え、それ以外(ローカルSupabaseへの
// 実リクエスト)は本物のfetchへ素通しする。
function stubTokenEndpoint(response: Response) {
  tokenResponse = response;
}

const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input.toString();
  if (url === TOKEN_ENDPOINT) {
    if (!tokenResponse) {
      throw new Error("token endpointのレスポンスがスタブされていません");
    }
    return Promise.resolve(tokenResponse);
  }
  return originalFetch(input, init);
});

function requestWithState(query: string, cookieState: string) {
  const headers = new Headers();
  headers.set("cookie", `google_oauth_state=${cookieState}`);
  return new NextRequest(`http://localhost:3000/api/google/callback${query}`, {
    headers,
  });
}

async function fetchTokenRows(userId: string) {
  const { data, error } = await admin
    .from("google_tokens")
    .select("user_id, refresh_token")
    .eq("user_id", userId);
  expect(error).toBeNull();
  return data ?? [];
}

beforeEach(() => {
  vi.mocked(createClient).mockReset();
  // P2-5: フラグ未設定=凍結(404)のため、P1-3のシナリオはフラグONで検証する
  vi.stubEnv("GOOGLE_INTEGRATION_ENABLED", "true");
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");
  vi.stubGlobal("fetch", fetchMock);
  tokenResponse = null;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

afterAll(async () => {
  for (const userId of createdUserIds) {
    await deleteTestUser(admin, userId);
  }
});

describe("/api/google/callback(結合)", () => {
  it("S19: state一致+トークン交換成功でgoogle_tokensに保存され/settings?connected=1へリダイレクトされる", async () => {
    const user = await createTestUser(admin);
    createdUserIds.push(user.id);
    mockLoggedInUser(user.id);
    stubTokenEndpoint(
      jsonResponse(200, {
        access_token: "at-1",
        refresh_token: "s19-refresh-token",
      }),
    );

    const response = await GET(
      requestWithState("?state=s19&code=valid-code", "s19"),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/settings?connected=1",
    );
    const rows = await fetchTokenRows(user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.refresh_token).toBe("s19-refresh-token");
  });

  it("S20: refresh_tokenが返らない場合はgoogle_tokensに行が作られず/settings?error=google_no_refresh_tokenへリダイレクトされる", async () => {
    const user = await createTestUser(admin);
    createdUserIds.push(user.id);
    mockLoggedInUser(user.id);
    stubTokenEndpoint(jsonResponse(200, { access_token: "at-1" }));

    const response = await GET(
      requestWithState("?state=s20&code=valid-code", "s20"),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/settings?error=google_no_refresh_token",
    );
    const rows = await fetchTokenRows(user.id);
    expect(rows).toHaveLength(0);
  });
});
