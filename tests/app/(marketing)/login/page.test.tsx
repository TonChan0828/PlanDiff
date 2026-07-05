import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
  }),
}));
vi.mock("@/lib/supabase/browser", () => ({
  createClient: vi.fn(),
}));

import LoginPage from "@/app/(marketing)/login/page";

// 仕様書: docs/specs/P1-1_Google認証.md S9

describe("ログインページ", () => {
  it("S9: error=auth クエリ付きで日本語のエラーメッセージと再試行ボタンが表示される", async () => {
    render(
      await LoginPage({
        searchParams: Promise.resolve({ error: "auth" }),
      }),
    );

    expect(
      screen.getByText(
        "ログインがキャンセルされました。もう一度お試しください",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Googleでログイン" }),
    ).toBeInTheDocument();
  });
});
