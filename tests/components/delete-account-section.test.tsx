import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/app/(app)/settings/actions", () => ({
  deleteAccountAction: vi.fn(),
}));

import { DeleteAccountSection } from "@/components/delete-account-section";

// 仕様書: docs/specs/P4-2_設定画面.md S3・S10

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DeleteAccountSection", () => {
  it("S3: 確認欄に「削除」と入力すると削除ボタンが有効になる", async () => {
    const user = userEvent.setup();
    render(<DeleteAccountSection />);

    const button = screen.getByRole("button", { name: "アカウントを削除" });
    expect(button).toBeDisabled();

    await user.type(
      screen.getByLabelText("確認のため「削除」と入力してください"),
      "削除",
    );

    expect(button).toBeEnabled();
  });

  it("S10: 空・部分一致・余分な空白では削除ボタンが無効のまま", async () => {
    const user = userEvent.setup();
    render(<DeleteAccountSection />);

    const button = screen.getByRole("button", { name: "アカウントを削除" });
    const input = screen.getByLabelText("確認のため「削除」と入力してください");

    // 空
    expect(button).toBeDisabled();

    // 部分一致
    await user.type(input, "削");
    expect(button).toBeDisabled();

    // 余分な空白(「削除 」)
    await user.clear(input);
    await user.type(input, "削除 ");
    expect(button).toBeDisabled();
  });
});
