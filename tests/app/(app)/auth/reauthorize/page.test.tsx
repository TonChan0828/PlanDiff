import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const signInWithOAuthMock = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/lib/supabase/browser", () => ({
  createClient: vi.fn(() => ({
    auth: { signInWithOAuth: signInWithOAuthMock },
  })),
}));

import ReauthorizePage from "@/app/(app)/auth/reauthorize/page";
import { buildGoogleSignInOptions } from "@/lib/supabase/auth-options";

// 仕様書: docs/specs/P1-1_Google認証.md S10

describe("再認可ページ", () => {
  it("S10: 説明文と再試行ボタンが表示され、ボタンはS1と同一の認可オプションで認可をやり直す", async () => {
    const user = userEvent.setup();
    render(<ReauthorizePage />);

    expect(
      screen.getByText(/カレンダーを読み取るための許可が完了していません/),
    ).toBeInTheDocument();

    const retryButton = screen.getByRole("button", {
      name: "カレンダー連携をやり直す",
    });
    await user.click(retryButton);

    expect(signInWithOAuthMock).toHaveBeenCalledWith(
      buildGoogleSignInOptions(window.location.origin),
    );
  });
});
