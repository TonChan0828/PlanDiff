import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ErrorPage from "@/app/error";

// 仕様書: docs/specs/P4-5_磨き込み.md S2, S3
// 未捕捉例外で日本語のエラー画面が表示され、内部情報は出さず、再試行できる

describe("エラー境界(error)", () => {
  it("S2: 「問題が発生しました」が表示され、エラーの内部情報(message/stack)は表示されない", () => {
    const error = Object.assign(new Error("secret internal detail"), {
      digest: "digest-123",
    });

    render(<ErrorPage error={error} unstable_retry={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: "問題が発生しました" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/secret internal detail/)).toBeNull();
    expect(document.body.textContent).not.toContain("secret internal detail");
    expect(document.body.textContent).not.toContain("digest-123");
  });

  it("S3: 「再試行」ボタンをクリックすると unstable_retry が1回呼ばれる", async () => {
    const retry = vi.fn();
    const user = userEvent.setup();

    render(<ErrorPage error={new Error("boom")} unstable_retry={retry} />);

    await user.click(screen.getByRole("button", { name: "再試行" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
