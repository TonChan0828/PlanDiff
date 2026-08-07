import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getSessionUser } from "@/lib/supabase/session-user";

// 仕様書: docs/specs/P6-1_サーバー往復の集約.md S1〜S4

function userFixture(id: string): User {
  return { id, email: `${id}@example.com` } as unknown as User;
}

/** auth.getUser だけを持つ最小のクライアントモック */
function createClientMock(user: User | null) {
  const getUser = vi.fn().mockResolvedValue({ data: { user }, error: null });
  const client = { auth: { getUser } } as unknown as SupabaseClient;
  return { client, getUser };
}

describe("getSessionUser のメモ化(S1〜S3)", () => {
  it("S1: 同一クライアントで2回呼んでも auth.getUser は1回だけ", async () => {
    const user = userFixture("u1");
    const { client, getUser } = createClientMock(user);

    const first = await getSessionUser(client);
    const second = await getSessionUser(client);

    expect(getUser).toHaveBeenCalledTimes(1);
    expect(first).toEqual(user);
    expect(second).toEqual(user);
  });

  it("S2: 並行呼び出しでも auth.getUser は1回だけ(Promiseを保持している)", async () => {
    const user = userFixture("u1");
    const { client, getUser } = createClientMock(user);

    const [first, second] = await Promise.all([
      getSessionUser(client),
      getSessionUser(client),
    ]);

    expect(getUser).toHaveBeenCalledTimes(1);
    expect(first).toEqual(user);
    expect(second).toEqual(user);
  });

  it("S3: 別インスタンスなら結果が混ざらない(ユーザーをまたいで共有しない)", async () => {
    const a = createClientMock(userFixture("user-a"));
    const b = createClientMock(userFixture("user-b"));

    const resultA = await getSessionUser(a.client);
    const resultB = await getSessionUser(b.client);

    expect(a.getUser).toHaveBeenCalledTimes(1);
    expect(b.getUser).toHaveBeenCalledTimes(1);
    expect(resultA?.id).toBe("user-a");
    expect(resultB?.id).toBe("user-b");
  });
});

describe("getSessionUser の異常系(S4)", () => {
  it("S4: 未ログイン(user が null)なら null を返し、例外を投げない", async () => {
    const { client, getUser } = createClientMock(null);

    await expect(getSessionUser(client)).resolves.toBeNull();
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it("S4: auth.getUser がエラーを返しても null を返す(呼び出し側の未ログイン分岐を維持)", async () => {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: { message: "invalid claim" },
    });
    const client = { auth: { getUser } } as unknown as SupabaseClient;

    await expect(getSessionUser(client)).resolves.toBeNull();
  });
});
