import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TermsPage from "@/app/(marketing)/terms/page";

// 仕様書: docs/specs/P0-3_プライバシーポリシーと利用規約.md S2

describe("利用規約ページ", () => {
  it("S2: 見出しと必須セクション(免責 / 禁止事項 / 準拠法)が表示される", () => {
    render(<TermsPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "利用規約" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /免責/ })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /禁止事項/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /準拠法/ })).toBeInTheDocument();
  });
});
