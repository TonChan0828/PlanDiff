import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  deleteGoogleRefreshToken: vi.fn(),
  deleteUserAccount: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

import { redirect } from "next/navigation";
import {
  deleteAccountAction,
  disconnectGoogleAction,
} from "@/app/(app)/settings/actions";
import {
  deleteGoogleRefreshToken,
  deleteUserAccount,
} from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// 仕様書: docs/specs/P1-3_メール認証とGoogle任意連携.md S22
// 仕様書: docs/specs/P4-2_設定画面.md S4(単体側)・S7・S8

const createClientMock = vi.mocked(createClient);
const deleteUserAccountMock = vi.mocked(deleteUserAccount);
const signOutMock = vi.fn().mockResolvedValue({ error: null });

function mockUser(user: { id: string } | null) {
  createClientMock.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
      signOut: signOutMock,
    },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUser({ id: "u1" });
});

describe("disconnectGoogleAction", () => {
  it("S22: deleteGoogleRefreshTokenが呼ばれ/settingsへリダイレクトされる", async () => {
    await expect(disconnectGoogleAction()).rejects.toThrow("NEXT_REDIRECT");

    expect(deleteGoogleRefreshToken).toHaveBeenCalledWith("u1");
    expect(redirect).toHaveBeenCalledWith("/settings");
  });
});

describe("deleteAccountAction", () => {
  it("S4(単体側): 削除成功時はセッションを破棄し/login?deleted=1へリダイレクトされる", async () => {
    deleteUserAccountMock.mockResolvedValue(true);

    await expect(deleteAccountAction()).rejects.toThrow("NEXT_REDIRECT");

    expect(deleteUserAccountMock).toHaveBeenCalledWith("u1");
    expect(signOutMock).toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/login?deleted=1");
  });

  it("S7: 未認証時は/loginへリダイレクトされ削除処理は呼ばれない", async () => {
    mockUser(null);

    await expect(deleteAccountAction()).rejects.toThrow("NEXT_REDIRECT");

    expect(deleteUserAccountMock).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("S8: 削除失敗時は/settings?error=account_delete_failedへリダイレクトされる", async () => {
    deleteUserAccountMock.mockResolvedValue(false);

    await expect(deleteAccountAction()).rejects.toThrow("NEXT_REDIRECT");

    // 失敗時はセッションを維持する(再試行できるようにする)
    expect(signOutMock).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith(
      "/settings?error=account_delete_failed",
    );
  });
});
