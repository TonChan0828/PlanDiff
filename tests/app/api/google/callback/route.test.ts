import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  saveGoogleRefreshToken: vi.fn(),
}));
vi.mock("@/lib/google/token", () => ({
  exchangeAuthorizationCode: vi.fn(),
}));

import { GET } from "@/app/api/google/callback/route";
import { exchangeAuthorizationCode } from "@/lib/google/token";
import { saveGoogleRefreshToken } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// 仕様書: docs/specs/P1-3_メール認証とGoogle任意連携.md S16 / S17 / S18

const createClientMock = vi.mocked(createClient);
const exchangeMock = vi.mocked(exchangeAuthorizationCode);
const saveMock = vi.mocked(saveGoogleRefreshToken);

function mockUser(user: { id: string } | null) {
  createClientMock.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

function requestWithState(query: string, cookieState?: string) {
  const headers = new Headers();
  if (cookieState) {
    headers.set("cookie", `google_oauth_state=${cookieState}`);
  }
  return new NextRequest(`http://localhost:3000/api/google/callback${query}`, {
    headers,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // P2-5: フラグ未設定=凍結(404)のため、P1-3のシナリオはフラグONで検証する
  vi.stubEnv("GOOGLE_INTEGRATION_ENABLED", "true");
  mockUser({ id: "u1" });
});

describe("/api/google/callback", () => {
  it("S16: stateがcookieの値と一致しない場合は/settings?error=google_stateへリダイレクトされる", async () => {
    const response = await GET(
      requestWithState("?state=wrong&code=abc", "correct-state"),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/settings?error=google_state",
    );
    expect(exchangeMock).not.toHaveBeenCalled();
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("S17: codeがない場合は/settings?error=google_authへリダイレクトされる", async () => {
    const response = await GET(requestWithState("?state=s1", "s1"));

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/settings?error=google_auth",
    );
    expect(exchangeMock).not.toHaveBeenCalled();
  });

  it("S17: Googleからのerrorパラメータ付きの場合は/settings?error=google_authへリダイレクトされる", async () => {
    const response = await GET(
      requestWithState("?state=s1&error=access_denied", "s1"),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/settings?error=google_auth",
    );
  });

  it("S18: トークン交換が失敗した場合は/settings?error=google_failedへリダイレクトされる", async () => {
    exchangeMock.mockResolvedValue({ ok: false });

    const response = await GET(
      requestWithState("?state=s1&code=valid-code", "s1"),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/settings?error=google_failed",
    );
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("refresh_tokenが返らない場合は/settings?error=google_no_refresh_tokenへリダイレクトされる", async () => {
    exchangeMock.mockResolvedValue({ ok: true, refreshToken: null });

    const response = await GET(
      requestWithState("?state=s1&code=valid-code", "s1"),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/settings?error=google_no_refresh_token",
    );
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("正常系: 交換成功時はsaveGoogleRefreshTokenが呼ばれ/settings?connected=1へリダイレクトされる", async () => {
    exchangeMock.mockResolvedValue({ ok: true, refreshToken: "rt-1" });
    saveMock.mockResolvedValue(true);

    const response = await GET(
      requestWithState("?state=s1&code=valid-code", "s1"),
    );

    expect(saveMock).toHaveBeenCalledWith("u1", "rt-1");
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/settings?connected=1",
    );
  });
});
