import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

const resetPasswordForEmailMock = vi.fn();
vi.mock("@/lib/supabase/browser", () => ({
  createClient: () => ({
    auth: { resetPasswordForEmail: resetPasswordForEmailMock },
  }),
}));

import { ForgotPasswordForm } from "@/components/forgot-password-form";

// 仕様書: docs/specs/P1-3_メール認証とGoogle任意連携.md S10 / S11

beforeEach(() => {
  resetPasswordForEmailMock.mockReset();
});

async function submit(email: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("メールアドレス"), email);
  await user.click(screen.getByRole("button", { name: "再設定メールを送る" }));
}

describe("ForgotPasswordForm", () => {
  it("S10: 登録済みメールでもresetPasswordForEmailが呼ばれ成功メッセージが表示される", async () => {
    resetPasswordForEmailMock.mockResolvedValue({ data: {}, error: null });
    render(<ForgotPasswordForm />);

    await submit("registered@example.com");

    await waitFor(() => {
      expect(
        screen.getByText(
          "ご入力のメールアドレスが登録されている場合、パスワード再設定用のメールをお送りしました",
        ),
      ).toBeInTheDocument();
    });
    expect(resetPasswordForEmailMock).toHaveBeenCalledWith(
      "registered@example.com",
      { redirectTo: `${window.location.origin}/auth/confirm-recovery` },
    );
  });

  it("S11: 未登録メールでも同一の成功メッセージが表示される", async () => {
    resetPasswordForEmailMock.mockResolvedValue({
      data: {},
      error: { message: "User not found" },
    });
    render(<ForgotPasswordForm />);

    await submit("unknown@example.com");

    await waitFor(() => {
      expect(
        screen.getByText(
          "ご入力のメールアドレスが登録されている場合、パスワード再設定用のメールをお送りしました",
        ),
      ).toBeInTheDocument();
    });
  });

  it("異常系: 不正なメール形式ではresetPasswordForEmailを呼ばずエラー表示する", async () => {
    render(<ForgotPasswordForm />);

    await submit("not-an-email");

    expect(
      screen.getByText("メールアドレスの形式が正しくありません"),
    ).toBeInTheDocument();
    expect(resetPasswordForEmailMock).not.toHaveBeenCalled();
  });
});
