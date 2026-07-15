import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/onboarding/complete", () => ({
  markOnboardingComplete: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

import { redirect } from "next/navigation";
import { completeOnboardingAction } from "@/app/(app)/onboarding/actions";
import { markOnboardingComplete } from "@/lib/onboarding/complete";
import { createClient } from "@/lib/supabase/server";

// 仕様書: docs/specs/P4-1_オンボーディング.md S5・S8

const createClientMock = vi.mocked(createClient);
const markOnboardingCompleteMock = vi.mocked(markOnboardingComplete);

function mockUser(user: { id: string } | null) {
  createClientMock.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUser({ id: "u1" });
});

describe("completeOnboardingAction", () => {
  it("S5: 保存成功時は/calendarへリダイレクトされる", async () => {
    markOnboardingCompleteMock.mockResolvedValue(true);

    await expect(completeOnboardingAction()).rejects.toThrow("NEXT_REDIRECT");

    expect(markOnboardingCompleteMock).toHaveBeenCalledWith(
      expect.anything(),
      "u1",
    );
    expect(redirect).toHaveBeenCalledWith("/calendar");
  });

  it("開始操作では最初の予定作成パネル付きのカレンダーへ進む", async () => {
    markOnboardingCompleteMock.mockResolvedValue(true);
    const formData = new FormData();
    formData.set("intent", "start");

    await expect(completeOnboardingAction(formData)).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(redirect).toHaveBeenCalledWith("/calendar?create=1");
  });

  it("S8: 保存失敗時は/onboarding?error=save_failedへリダイレクトされる", async () => {
    markOnboardingCompleteMock.mockResolvedValue(false);

    await expect(completeOnboardingAction()).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/onboarding?error=save_failed");
  });

  it("未認証時は/loginへリダイレクトされ保存処理は呼ばれない", async () => {
    mockUser(null);

    await expect(completeOnboardingAction()).rejects.toThrow("NEXT_REDIRECT");

    expect(markOnboardingCompleteMock).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/login");
  });
});
