import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  deleteGoogleRefreshToken: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

import { redirect } from "next/navigation";
import { disconnectGoogleAction } from "@/app/(app)/settings/actions";
import { deleteGoogleRefreshToken } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// 仕様書: docs/specs/P1-3_メール認証とGoogle任意連携.md S22

const createClientMock = vi.mocked(createClient);

beforeEach(() => {
  vi.clearAllMocks();
  createClientMock.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
    },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
});

describe("disconnectGoogleAction", () => {
  it("S22: deleteGoogleRefreshTokenが呼ばれ/settingsへリダイレクトされる", async () => {
    await expect(disconnectGoogleAction()).rejects.toThrow("NEXT_REDIRECT");

    expect(deleteGoogleRefreshToken).toHaveBeenCalledWith("u1");
    expect(redirect).toHaveBeenCalledWith("/settings");
  });
});
