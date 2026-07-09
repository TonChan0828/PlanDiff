import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { GET } from "@/app/auth/confirm-recovery/route";
import { createClient } from "@/lib/supabase/server";

// 仕様書: docs/specs/P1-3_メール認証とGoogle任意連携.md S12

const createClientMock = vi.mocked(createClient);

function mockExchangeResult(result: { error: { message: string } | null }) {
  createClientMock.mockResolvedValue({
    auth: { exchangeCodeForSession: vi.fn().mockResolvedValue(result) },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/auth/confirm-recovery", () => {
  it("正常系: 有効な認可コードで/reset-passwordへリダイレクトされる", async () => {
    mockExchangeResult({ error: null });

    const response = await GET(
      new NextRequest(
        "http://localhost:3000/auth/confirm-recovery?code=valid-code",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/reset-password",
    );
  });

  it("S12: 期限切れ/使用済みの認可コードで/forgot-password?error=expiredへリダイレクトされる", async () => {
    mockExchangeResult({ error: { message: "invalid or expired" } });

    const response = await GET(
      new NextRequest(
        "http://localhost:3000/auth/confirm-recovery?code=expired-code",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/forgot-password?error=expired",
    );
  });

  it("異常系: codeがない場合は/forgot-password?error=expiredへリダイレクトされる", async () => {
    const response = await GET(
      new NextRequest("http://localhost:3000/auth/confirm-recovery"),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/forgot-password?error=expired",
    );
  });
});
