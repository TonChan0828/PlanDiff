import { redirect } from "next/navigation";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/components/login-form", () => ({
  LoginForm: () => <div data-testid="login-form" />,
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

import { createClient } from "@/lib/supabase/server";
import LoginPage from "@/app/(marketing)/login/page";

// 仕様書: docs/specs/P1-3_メール認証とGoogle任意連携.md(ログインページ)

const createClientMock = vi.mocked(createClient);

function mockUser(user: { id: string } | null) {
  createClientMock.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ログインページ", () => {
  it("ログイン済みの場合は/calendarへリダイレクトする", async () => {
    mockUser({ id: "u1" });

    await expect(
      LoginPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/calendar");
  });

  it("未ログイン時はログインフォームを表示する", async () => {
    mockUser(null);

    render(await LoginPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByTestId("login-form")).toBeInTheDocument();
  });

  it("error=confirm_failed の場合は確認リンク期限切れメッセージを表示する", async () => {
    mockUser(null);

    render(
      await LoginPage({
        searchParams: Promise.resolve({ error: "confirm_failed" }),
      }),
    );

    expect(
      screen.getByText(
        "確認リンクの有効期限が切れています。再度サインアップするか、ログインしてから確認メールを再送してください",
      ),
    ).toBeInTheDocument();
  });

  it("reset=success の場合はパスワード再設定完了メッセージを表示する", async () => {
    mockUser(null);

    render(
      await LoginPage({
        searchParams: Promise.resolve({ reset: "success" }),
      }),
    );

    expect(
      screen.getByText(
        "パスワードを再設定しました。新しいパスワードでログインしてください",
      ),
    ).toBeInTheDocument();
  });
});
