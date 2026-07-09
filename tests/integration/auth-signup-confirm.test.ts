import { afterAll, describe, expect, it } from "vitest";
import { createAdminClient, createAnonClient } from "./helpers";

// 仕様書: docs/specs/P1-3_メール認証とGoogle任意連携.md S5
// メール/パスワードの signUp でも profiles トリガーが発火することを実DBで検証する。

const admin = createAdminClient();
const createdUserIds: string[] = [];

afterAll(async () => {
  for (const userId of createdUserIds) {
    await admin.auth.admin.deleteUser(userId);
  }
});

describe("メール/パスワードsignUp(結合)", () => {
  it("S5: signUp成功時にprofilesへ行が作成される(provider非依存のトリガー)", async () => {
    const anon = createAnonClient();
    const email = `signup-it-${crypto.randomUUID()}@example.com`;

    const { data, error } = await anon.auth.signUp({
      email,
      password: "plandiff-signup-test-pw",
    });
    expect(error).toBeNull();
    expect(data.user).not.toBeNull();
    const userId = data.user!.id;
    createdUserIds.push(userId);

    const { data: profileRows, error: profileError } = await admin
      .from("profiles")
      .select("id, display_name")
      .eq("id", userId);
    expect(profileError).toBeNull();
    expect(profileRows).toHaveLength(1);
    expect(profileRows?.[0]?.display_name).toBe("");
  });
});
