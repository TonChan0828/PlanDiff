import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import AppLayout from "@/app/(app)/layout";
import { signOutAction } from "@/app/(app)/actions";
import { saveGoogleRefreshToken } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  createAdminClient,
  createAnonClient,
  createTestUser,
  deleteTestUser,
} from "./helpers";

// 仕様書: docs/specs/P1-1_Google認証.md S7 / S8

const admin = createAdminClient();
const createdUserIds: string[] = [];

beforeEach(() => {
  vi.mocked(createClient).mockReset();
});

afterAll(async () => {
  for (const userId of createdUserIds) {
    await deleteTestUser(admin, userId);
  }
});

describe("セッション(結合)", () => {
  it("S7: ログアウトのServer Actionでセッションが無効化され、google_tokens の行は残る", async () => {
    const user = await createTestUser(admin);
    createdUserIds.push(user.id);
    const seeded = await saveGoogleRefreshToken(user.id, "s7-keep-token");
    expect(seeded).toBe(true);

    vi.mocked(createClient).mockResolvedValue(user.client);

    // redirect() は NEXT_REDIRECT を throw する
    await expect(signOutAction()).rejects.toMatchObject({
      digest: expect.stringContaining("/login"),
    });

    const { data: afterSignOut } = await user.client.auth.getUser();
    expect(afterSignOut.user).toBeNull();

    const { data: rows } = await admin
      .from("google_tokens")
      .select("user_id")
      .eq("user_id", user.id);
    expect(rows).toHaveLength(1);
  });

  it("S8: 未ログイン状態で (app) レイアウトを通ると /login へリダイレクトされる", async () => {
    vi.mocked(createClient).mockResolvedValue(createAnonClient());

    await expect(AppLayout({ children: null })).rejects.toMatchObject({
      digest: expect.stringContaining("/login"),
    });
  });
});
