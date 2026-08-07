import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 仕様書: docs/specs/P6-1_サーバー往復の集約.md S12・S13

const createSupabaseClient = vi.hoisted(() => vi.fn());

vi.mock("@supabase/supabase-js", () => ({
  createClient: createSupabaseClient,
}));

const ORIGINAL_ENV = { ...process.env };

function stubClient() {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi
            .fn()
            .mockResolvedValue({ data: { refresh_token: "rt" }, error: null }),
        }),
      }),
    }),
  };
}

beforeEach(() => {
  vi.resetModules();
  createSupabaseClient.mockReset();
  createSupabaseClient.mockImplementation(() => stubClient());
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("service role クライアントの singleton 化(S12)", () => {
  it("S12: 2回呼んでもクライアントの生成は1回だけ", async () => {
    const { getGoogleRefreshToken } = await import("@/lib/supabase/admin");

    await getGoogleRefreshToken("user-1");
    await getGoogleRefreshToken("user-2");

    expect(createSupabaseClient).toHaveBeenCalledTimes(1);
  });

  it("S12: 生成時のオプション(セッションを持たない)は従来どおり", async () => {
    const { getGoogleRefreshToken } = await import("@/lib/supabase/admin");

    await getGoogleRefreshToken("user-1");

    expect(createSupabaseClient).toHaveBeenCalledWith(
      "http://127.0.0.1:54321",
      "service-role-key",
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  });
});

describe("環境変数未設定時の挙動(S13)", () => {
  it("S13: SUPABASE_SERVICE_ROLE_KEY 未設定なら ok:false を返す(握りつぶさず記録する)", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { getGoogleRefreshToken } = await import("@/lib/supabase/admin");

    const result = await getGoogleRefreshToken("user-1");

    expect(result).toEqual({ ok: false });
    expect(createSupabaseClient).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("S13: 未設定で失敗した後に設定されれば、次回は生成できる(nullをキャッシュしない)", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { getGoogleRefreshToken } = await import("@/lib/supabase/admin");

    await getGoogleRefreshToken("user-1");
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    const result = await getGoogleRefreshToken("user-1");

    expect(result).toEqual({ ok: true, refreshToken: "rt" });
    expect(createSupabaseClient).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });
});
