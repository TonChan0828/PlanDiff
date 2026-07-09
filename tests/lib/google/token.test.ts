import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  exchangeAuthorizationCode,
  refreshAccessToken,
} from "@/lib/google/token";

// 仕様書: docs/specs/P1-2_カレンダー同期.md S1 / S2 / S3

const fetchMock = vi.fn();

function jsonResponse(status: number, body: object): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("refreshAccessToken", () => {
  it("S1: grant_type=refresh_token・client_id・client_secret を含むPOSTでaccess tokenを取得する", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { access_token: "at-123", expires_in: 3599 }),
    );

    const result = await refreshAccessToken("rt-1");

    expect(result).toEqual({ ok: true, accessToken: "at-123" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    expect(init.method).toBe("POST");
    const params = new URLSearchParams(String(init.body));
    expect(params.get("grant_type")).toBe("refresh_token");
    expect(params.get("refresh_token")).toBe("rt-1");
    expect(params.get("client_id")).toBe("test-client-id");
    expect(params.get("client_secret")).toBe("test-client-secret");
  });

  it("S2: invalid_grant の場合は reason=reauthorize が返り、ログにトークン値が含まれない", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, { error: "invalid_grant", error_description: "Bad" }),
    );
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = await refreshAccessToken("rt-secret-value");

    expect(result).toEqual({ ok: false, reason: "reauthorize" });
    const loggedText = consoleErrorSpy.mock.calls
      .map((args) => JSON.stringify(args))
      .join("\n");
    expect(loggedText).not.toContain("rt-secret-value");

    consoleErrorSpy.mockRestore();
  });

  it("S3: tokenエンドポイントが5xx/ネットワークエラーの場合は reason=transient が返る", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    fetchMock.mockResolvedValueOnce(jsonResponse(500, {}));
    expect(await refreshAccessToken("rt-1")).toEqual({
      ok: false,
      reason: "transient",
    });

    fetchMock.mockRejectedValueOnce(new Error("network down"));
    expect(await refreshAccessToken("rt-1")).toEqual({
      ok: false,
      reason: "transient",
    });

    consoleErrorSpy.mockRestore();
  });
});

// 仕様書: docs/specs/P1-3_メール認証とGoogle任意連携.md S18

describe("exchangeAuthorizationCode", () => {
  it("正常系: grant_type=authorization_code・redirect_uriを含むPOSTでrefresh_tokenを取得する", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { access_token: "at-1", refresh_token: "rt-1" }),
    );

    const result = await exchangeAuthorizationCode(
      "auth-code-1",
      "https://plandiff.example.com/api/google/callback",
    );

    expect(result).toEqual({ ok: true, refreshToken: "rt-1" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    const params = new URLSearchParams(String(init.body));
    expect(params.get("grant_type")).toBe("authorization_code");
    expect(params.get("code")).toBe("auth-code-1");
    expect(params.get("redirect_uri")).toBe(
      "https://plandiff.example.com/api/google/callback",
    );
  });

  it("異常系: refresh_tokenが返らない場合はok:true・refreshToken:nullになる", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { access_token: "at-1" }));

    const result = await exchangeAuthorizationCode("auth-code-1", "redirect");

    expect(result).toEqual({ ok: true, refreshToken: null });
  });

  it("S18: 非200レスポンスの場合はok:falseになり、ログにコード値が含まれない", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    fetchMock.mockResolvedValue(jsonResponse(400, { error: "invalid_grant" }));

    const result = await exchangeAuthorizationCode(
      "secret-auth-code-value",
      "redirect",
    );

    expect(result).toEqual({ ok: false });
    const loggedText = consoleErrorSpy.mock.calls
      .map((args) => JSON.stringify(args))
      .join("\n");
    expect(loggedText).not.toContain("secret-auth-code-value");

    consoleErrorSpy.mockRestore();
  });
});
