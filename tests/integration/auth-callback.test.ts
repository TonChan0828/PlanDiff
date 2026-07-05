import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { GET } from "@/app/auth/callback/route";
import { saveGoogleRefreshToken } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, createTestUser, deleteTestUser } from "./helpers";

// 仕様書: docs/specs/P1-1_Google認証.md S2 / S3 / S6
// exchangeCodeForSession(Google OAuth境界)のみモックし、
// google_tokens への保存はローカルSupabase(service role)で実際に検証する。

const admin = createAdminClient();
const createdUserIds: string[] = [];

function mockExchangeSession(session: object | null) {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      exchangeCodeForSession: vi
        .fn()
        .mockResolvedValue({ data: { session }, error: null }),
    },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
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
});

afterAll(async () => {
  for (const userId of createdUserIds) {
    await deleteTestUser(admin, userId);
  }
});

describe("/auth/callback(結合)", () => {
  it("S2: provider_refresh_token ありのセッションで google_tokens に保存され /calendar へリダイレクトされる", async () => {
    const user = await createTestUser(admin);
    createdUserIds.push(user.id);
    mockExchangeSession({
      user: { id: user.id },
      provider_refresh_token: "s2-refresh-token",
    });

    const response = await GET(
      new NextRequest("http://localhost:3000/auth/callback?code=valid-code"),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/calendar",
    );
    const rows = await fetchTokenRows(user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.refresh_token).toBe("s2-refresh-token");
  });

  it("S3: provider_refresh_token なしの場合は行が作られず /auth/reauthorize へリダイレクトされる", async () => {
    const user = await createTestUser(admin);
    createdUserIds.push(user.id);
    mockExchangeSession({
      user: { id: user.id },
      provider_refresh_token: undefined,
    });

    const response = await GET(
      new NextRequest("http://localhost:3000/auth/callback?code=valid-code"),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/auth/reauthorize",
    );
    const rows = await fetchTokenRows(user.id);
    expect(rows).toHaveLength(0);
  });

  it("S6: 既存行があるユーザーの再ログインで upsert され、1行のまま新しい refresh token に置き換わる", async () => {
    const user = await createTestUser(admin);
    createdUserIds.push(user.id);
    const seeded = await saveGoogleRefreshToken(user.id, "s6-old-token");
    expect(seeded).toBe(true);

    mockExchangeSession({
      user: { id: user.id },
      provider_refresh_token: "s6-new-token",
    });
    const response = await GET(
      new NextRequest("http://localhost:3000/auth/callback?code=valid-code"),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/calendar",
    );
    const rows = await fetchTokenRows(user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.refresh_token).toBe("s6-new-token");
  });
});
