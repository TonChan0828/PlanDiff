import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import NotFound from "@/app/not-found";

// 仕様書: docs/specs/P4-5_磨き込み.md S1
// 存在しないURLで日本語の404が表示され、トップへ戻れる

describe("404ページ(not-found)", () => {
  it("S1: 「ページが見つかりません」の見出しと / へのリンクが表示される", () => {
    render(<NotFound />);

    expect(
      screen.getByRole("heading", { name: "ページが見つかりません" }),
    ).toBeInTheDocument();

    const homeLink = screen.getByRole("link", { name: "トップへ戻る" });
    expect(homeLink).toHaveAttribute("href", "/");
  });
});
