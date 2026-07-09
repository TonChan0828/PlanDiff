import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

const updateUserMock = vi.fn();
const signOutMock = vi.fn();
const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));
vi.mock("@/lib/supabase/browser", () => ({
  createClient: () => ({
    auth: { updateUser: updateUserMock, signOut: signOutMock },
  }),
}));

import { ResetPasswordForm } from "@/components/reset-password-form";

// 仕様書: docs/specs/P1-3_メール認証とGoogle任意連携.md S13

beforeEach(() => {
  updateUserMock.mockReset();
  signOutMock.mockReset();
  pushMock.mockReset();
});

async function submit(password: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("新しいパスワード"), password);
  await user.click(screen.getByRole("button", { name: "パスワードを更新" }));
}

describe("ResetPasswordForm", () => {
  it("S13: 正常系。updateUser→signOutの後に/login?reset=successへ遷移する", async () => {
    updateUserMock.mockResolvedValue({ error: null });
    signOutMock.mockResolvedValue({ error: null });
    render(<ResetPasswordForm />);

    await submit("newpassword123");

    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith("/login?reset=success"),
    );
    expect(updateUserMock).toHaveBeenCalledWith({
      password: "newpassword123",
    });
    expect(signOutMock).toHaveBeenCalled();
  });

  it("境界値: 7文字のパスワードはエラー表示になりupdateUserを呼ばない", async () => {
    render(<ResetPasswordForm />);

    await submit("1234567");

    expect(
      screen.getByText("パスワードは8文字以上で入力してください"),
    ).toBeInTheDocument();
    expect(updateUserMock).not.toHaveBeenCalled();
  });
});
