import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

const signInWithPasswordMock = vi.fn();
const resendMock = vi.fn();
const pushMock = vi.fn();
const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));
vi.mock("@/lib/supabase/browser", () => ({
  createClient: () => ({
    auth: { signInWithPassword: signInWithPasswordMock, resend: resendMock },
  }),
}));

import { LoginForm } from "@/components/login-form";

// 仕様書: docs/specs/P1-3_メール認証とGoogle任意連携.md S8 / S9

beforeEach(() => {
  signInWithPasswordMock.mockReset();
  resendMock.mockReset();
  pushMock.mockReset();
  refreshMock.mockReset();
});

async function submit(email: string, password: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("メールアドレス"), email);
  await user.type(screen.getByLabelText("パスワード"), password);
  await user.click(screen.getByRole("button", { name: "ログイン" }));
}

describe("LoginForm", () => {
  it("正常系: ログイン成功で/calendarへ遷移する", async () => {
    signInWithPasswordMock.mockResolvedValue({ error: null });
    render(<LoginForm />);

    await submit("user@example.com", "password123");

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/calendar"));
    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "password123",
    });
  });

  it("S8: 異常系。パスワード不一致で共通のエラーメッセージを表示する", async () => {
    signInWithPasswordMock.mockResolvedValue({
      error: { message: "Invalid login credentials" },
    });
    render(<LoginForm />);

    await submit("user@example.com", "wrong-password");

    expect(
      await screen.findByText(
        "メールアドレスまたはパスワードが正しくありません",
      ),
    ).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("S9: 異常系。メール未確認時は未確認メッセージと再送導線が表示される", async () => {
    signInWithPasswordMock.mockResolvedValue({
      error: { message: "Email not confirmed" },
    });
    render(<LoginForm />);

    await submit("user@example.com", "password123");

    expect(
      await screen.findByText(
        "メールアドレスの確認が完了していません。確認メールをご確認ください",
      ),
    ).toBeInTheDocument();
    const resendButton = screen.getByRole("button", {
      name: "確認メールを再送する",
    });
    expect(resendButton).toBeInTheDocument();

    resendMock.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    await user.click(resendButton);

    expect(
      await screen.findByText("確認メールを再送しました"),
    ).toBeInTheDocument();
    expect(resendMock).toHaveBeenCalledWith({
      type: "signup",
      email: "user@example.com",
    });
  });
});
