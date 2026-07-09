import { redirect } from "next/navigation";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/components/signup-form", () => ({
  SignupForm: () => <div data-testid="signup-form" />,
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

import { createClient } from "@/lib/supabase/server";
import SignupPage from "@/app/(marketing)/signup/page";

// 仕様書: docs/specs/P1-3_メール認証とGoogle任意連携.md(サインアップページ)

const createClientMock = vi.mocked(createClient);

function mockUser(user: { id: string } | null) {
  createClientMock.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("サインアップページ", () => {
  it("ログイン済みの場合は/calendarへリダイレクトする", async () => {
    mockUser({ id: "u1" });

    await expect(SignupPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/calendar");
  });

  it("未ログイン時はサインアップフォームを表示する", async () => {
    mockUser(null);

    render(await SignupPage());

    expect(screen.getByTestId("signup-form")).toBeInTheDocument();
  });
});
