import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/forgot-password-form", () => ({
  ForgotPasswordForm: () => <div data-testid="forgot-password-form" />,
}));

import ForgotPasswordPage from "@/app/(marketing)/forgot-password/page";

// 仕様書: docs/specs/P1-3_メール認証とGoogle任意連携.md(パスワード再設定申請ページ)

describe("パスワード再設定申請ページ", () => {
  it("通常時はフォームを表示する", async () => {
    render(await ForgotPasswordPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByTestId("forgot-password-form")).toBeInTheDocument();
  });

  it("S12: error=expired の場合はリンク期限切れメッセージを表示する", async () => {
    render(
      await ForgotPasswordPage({
        searchParams: Promise.resolve({ error: "expired" }),
      }),
    );

    expect(
      screen.getByText(
        "リンクの有効期限が切れています。もう一度パスワード再設定をお試しください",
      ),
    ).toBeInTheDocument();
  });
});
