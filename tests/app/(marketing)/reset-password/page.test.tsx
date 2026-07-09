import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/components/reset-password-form", () => ({
  ResetPasswordForm: () => <div data-testid="reset-password-form" />,
}));

import { createClient } from "@/lib/supabase/server";
import ResetPasswordPage from "@/app/(marketing)/reset-password/page";

// 仕様書: docs/specs/P1-3_メール認証とGoogle任意連携.md S13 / S14

const createClientMock = vi.mocked(createClient);

function mockUser(user: { id: string } | null) {
  createClientMock.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("パスワード再設定ページ", () => {
  it("S13: リカバリーセッションがある場合はフォームを表示する", async () => {
    mockUser({ id: "u1" });

    render(await ResetPasswordPage());

    expect(screen.getByTestId("reset-password-form")).toBeInTheDocument();
  });

  it("S14: セッションが無い場合はリンク期限切れメッセージとforgot-password導線を表示する", async () => {
    mockUser(null);

    render(await ResetPasswordPage());

    expect(
      screen.getByText("リンクの有効期限が切れています"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "パスワード再設定へ戻る" }),
    ).toHaveAttribute("href", "/forgot-password");
  });
});
