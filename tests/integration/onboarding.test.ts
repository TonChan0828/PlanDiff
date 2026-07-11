import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { markOnboardingComplete } from "@/lib/onboarding/complete";
import {
  createAdminClient,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "./helpers";

// 仕様書: docs/specs/P4-1_オンボーディング.md S5・S9・S11

describe("オンボーディング完了(結合)", () => {
  let admin: SupabaseClient;
  let userA: TestUser;
  let userB: TestUser;

  async function fetchOnboardedAt(userId: string): Promise<string | null> {
    const { data, error } = await admin
      .from("profiles")
      .select("onboarded_at")
      .eq("id", userId)
      .single();
    if (error || !data)
      throw new Error(`profilesの取得に失敗: ${error?.message}`);
    return data.onboarded_at as string | null;
  }

  beforeAll(async () => {
    admin = createAdminClient();
    userA = await createTestUser(admin, "オンボーディングA");
    userB = await createTestUser(admin, "オンボーディングB");
  });

  afterAll(async () => {
    await deleteTestUser(admin, userA.id);
    await deleteTestUser(admin, userB.id);
  });

  it("S11: 新規ユーザーのonboarded_atはNULLで作成される", async () => {
    expect(await fetchOnboardedAt(userA.id)).toBeNull();
  });

  it("S5: 本人クライアントで実行するとonboarded_atが現在時刻で更新される", async () => {
    const ok = await markOnboardingComplete(userA.client, userA.id);
    expect(ok).toBe(true);

    const onboardedAt = await fetchOnboardedAt(userA.id);
    expect(onboardedAt).not.toBeNull();
    expect(new Date(onboardedAt!).getTime()).not.toBeNaN();
  });

  it("S9: 他ユーザーのonboarded_atはRLSにより更新できない", async () => {
    const ok = await markOnboardingComplete(userA.client, userB.id);
    expect(ok).toBe(false);

    expect(await fetchOnboardedAt(userB.id)).toBeNull();
  });
});
