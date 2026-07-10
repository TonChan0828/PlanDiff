import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { GET } from "@/app/api/google/connect/route";
import { createClient } from "@/lib/supabase/server";

// 仕様書: docs/specs/P1-3_メール認証とGoogle任意連携.md S15

const createClientMock = vi.mocked(createClient);

function mockUser(user: { id: string } | null) {
  createClientMock.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client-id");
  // P2-5: フラグ未設定=凍結(404)のため、P1-3のシナリオはフラグONで検証する
  vi.stubEnv("GOOGLE_INTEGRATION_ENABLED", "true");
});

describe("/api/google/connect", () => {
  it("S15: ログイン中ユーザーはstateがcookieに保存され、Google認可URLへリダイレクトされる", async () => {
    mockUser({ id: "u1" });

    const response = await GET(
      new NextRequest("http://localhost:3000/api/google/connect"),
    );

    const location = response.headers.get("location");
    expect(location).not.toBeNull();
    const url = new URL(location!);
    expect(url.origin + url.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("scope")).toBe(
      "https://www.googleapis.com/auth/calendar.events.readonly",
    );
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/google/callback",
    );

    const stateParam = url.searchParams.get("state");
    expect(stateParam).toBeTruthy();

    const setCookie = response.cookies.get("google_oauth_state");
    expect(setCookie?.value).toBe(stateParam);
  });

  it("異常系: 未ログインの場合は/loginへリダイレクトされる", async () => {
    mockUser(null);

    const response = await GET(
      new NextRequest("http://localhost:3000/api/google/connect"),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login",
    );
  });
});
