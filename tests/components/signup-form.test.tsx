import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

const signUpMock = vi.fn();
vi.mock("@/lib/supabase/browser", () => ({
  createClient: () => ({ auth: { signUp: signUpMock } }),
}));

import { SignupForm } from "@/components/signup-form";

// 仕様書: docs/specs/P1-3_メール認証とGoogle任意連携.md S1 / S2 / S3 / S4

beforeEach(() => {
  signUpMock.mockReset();
});

async function fillForm(email: string, password: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("メールアドレス"), email);
  await user.type(screen.getByLabelText("パスワード"), password);
  await user.click(screen.getByRole("button", { name: "アカウントを作成" }));
}

describe("SignupForm", () => {
  it("S1: 正常系。有効な入力でsignUpがemailRedirectTo付きで呼ばれ、確認メール送信画面になる", async () => {
    signUpMock.mockResolvedValue({ data: {}, error: null });
    render(<SignupForm />);

    await fillForm("user@example.com", "password123");

    await waitFor(() => {
      expect(screen.getByText("確認メールを送信しました")).toBeInTheDocument();
    });
    expect(signUpMock).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "password123",
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    });
  });

  it("S2: 異常系。不正なメール形式ではsignUpを呼ばずフォーム内エラーを表示する", async () => {
    render(<SignupForm />);

    await fillForm("not-an-email", "password123");

    expect(
      screen.getByText("メールアドレスの形式が正しくありません"),
    ).toBeInTheDocument();
    expect(signUpMock).not.toHaveBeenCalled();
  });

  it("S3: 境界値。7文字のパスワードはエラー表示になりsignUpを呼ばない", async () => {
    render(<SignupForm />);

    await fillForm("user@example.com", "1234567");

    expect(
      screen.getByText("パスワードは8文字以上で入力してください"),
    ).toBeInTheDocument();
    expect(signUpMock).not.toHaveBeenCalled();
  });

  it("S4: 異常系。既存ユーザー相当のエラーでも通常成功時と同一の画面を表示する", async () => {
    signUpMock.mockResolvedValue({
      data: {},
      error: { message: "User already registered" },
    });
    render(<SignupForm />);

    await fillForm("user@example.com", "password123");

    await waitFor(() => {
      expect(screen.getByText("確認メールを送信しました")).toBeInTheDocument();
    });
  });
});
