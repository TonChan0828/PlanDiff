import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { GET } from "@/app/auth/confirm/route";
import { createClient } from "@/lib/supabase/server";

// 仕様書: docs/specs/P1-3_メール認証とGoogle任意連携.md S6 / S7
// PKCEフロー(@supabase/ssrのデフォルト)ではGoTrueが確認リンク検証後に
// 認可コード(?code=...)付きでリダイレクトするため、exchangeCodeForSessionで処理する。

const createClientMock = vi.mocked(createClient);

function mockExchangeResult(result: { error: { message: string } | null }) {
  createClientMock.mockResolvedValue({
    auth: { exchangeCodeForSession: vi.fn().mockResolvedValue(result) },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/auth/confirm", () => {
  it("S6: 有効な認可コードで/calendarへリダイレクトされる", async () => {
    mockExchangeResult({ error: null });

    const response = await GET(
      new NextRequest("http://localhost:3000/auth/confirm?code=valid-code"),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/calendar",
    );
  });

  it("S7: 期限切れ/使用済みの認可コードで/login?error=confirm_failedへリダイレクトされる", async () => {
    mockExchangeResult({
      error: {
        message:
          "invalid request: both auth code and code verifier should be non-empty",
      },
    });

    const response = await GET(
      new NextRequest("http://localhost:3000/auth/confirm?code=expired-code"),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?error=confirm_failed",
    );
  });

  it("異常系: codeがない場合は/login?error=confirm_failedへリダイレクトされる", async () => {
    const response = await GET(
      new NextRequest("http://localhost:3000/auth/confirm"),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?error=confirm_failed",
    );
  });
});
