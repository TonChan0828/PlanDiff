import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ saveGoogleRefreshToken: vi.fn() }));

import { GET } from "@/app/auth/callback/route";
import { createClient } from "@/lib/supabase/server";

// 仕様書: docs/specs/P1-1_Google認証.md S4 / S5

const createClientMock = vi.mocked(createClient);

function mockExchangeResult(result: {
  data: { session: object | null };
  error: { name: string; status: number } | null;
}) {
  createClientMock.mockResolvedValue({
    auth: {
      exchangeCodeForSession: vi.fn().mockResolvedValue(result),
    },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/auth/callback", () => {
  it("S4: code パラメータがない場合は /login?error=auth へリダイレクトされる", async () => {
    const response = await GET(
      new NextRequest("http://localhost:3000/auth/callback"),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?error=auth",
    );
  });

  it("S4: Googleからの error パラメータ付きの場合は /login?error=auth へリダイレクトされる", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost:3000/auth/callback?error=access_denied",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?error=auth",
    );
  });

  it("S5: exchangeCodeForSession が失敗した場合は /login?error=failed へリダイレクトされ、ログにコード・トークン値が含まれない", async () => {
    mockExchangeResult({
      data: { session: null },
      error: { name: "AuthApiError", status: 400 },
    });
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const secretCode = "secret-authorization-code-12345";
    const response = await GET(
      new NextRequest(`http://localhost:3000/auth/callback?code=${secretCode}`),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?error=failed",
    );
    const loggedText = consoleErrorSpy.mock.calls
      .map((args) => JSON.stringify(args))
      .join("\n");
    expect(loggedText).not.toContain(secretCode);

    consoleErrorSpy.mockRestore();
  });
});
