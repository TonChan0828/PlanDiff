import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  saveGoogleRefreshToken: vi.fn(),
  getGoogleRefreshToken: vi.fn(),
  deleteGoogleRefreshToken: vi.fn(),
}));
vi.mock("@/lib/google/token", () => ({ refreshAccessToken: vi.fn() }));
vi.mock("@/lib/google/calendar", () => ({ fetchPrimaryEvents: vi.fn() }));

import { POST } from "@/app/api/calendar/sync/route";
import { getGoogleRefreshToken } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// 仕様書: docs/specs/P1-2_カレンダー同期.md S16(期間バリデーション)

const createClientMock = vi.mocked(createClient);

function callSync(body: unknown) {
  return POST(
    new NextRequest("http://localhost:3000/api/calendar/sync", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // P2-5: フラグ未設定=凍結(404)のため、P1-2のシナリオはフラグONで検証する
  vi.stubEnv("GOOGLE_INTEGRATION_ENABLED", "true");
  createClientMock.mockResolvedValue({
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
    },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
});

describe("POST /api/calendar/sync のバリデーション", () => {
  it.each([
    [
      "timeMin >= timeMax",
      {
        timeMin: "2026-07-20T00:00:00.000Z",
        timeMax: "2026-07-06T00:00:00.000Z",
      },
    ],
    [
      "timeMin == timeMax",
      {
        timeMin: "2026-07-06T00:00:00.000Z",
        timeMax: "2026-07-06T00:00:00.000Z",
      },
    ],
    [
      "期間が35日を超える",
      {
        timeMin: "2026-07-06T00:00:00.000Z",
        timeMax: "2026-08-11T00:00:00.001Z",
      },
    ],
    [
      "不正な日付文字列",
      { timeMin: "きょう", timeMax: "2026-07-20T00:00:00.000Z" },
    ],
    ["timeMax がない", { timeMin: "2026-07-06T00:00:00.000Z" }],
    ["ボディがオブジェクトでない", "2026-07-06"],
  ])(
    "S16: %s の場合は 400 invalid_range が返り、トークンは読み取られない",
    async (_label, body) => {
      const response = await callSync(body);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_range" });
      expect(getGoogleRefreshToken).not.toHaveBeenCalled();
    },
  );

  it("S16(境界値): ちょうど35日の期間は拒否されない", async () => {
    // バリデーションは通過し、次段(トークン取得)まで進む
    vi.mocked(getGoogleRefreshToken).mockResolvedValue({
      ok: true,
      refreshToken: null,
    });

    const response = await callSync({
      timeMin: "2026-07-06T00:00:00.000Z",
      timeMax: "2026-08-10T00:00:00.000Z",
    });

    expect(response.status).not.toBe(400);
    expect(getGoogleRefreshToken).toHaveBeenCalledWith("user-1");
  });
});
