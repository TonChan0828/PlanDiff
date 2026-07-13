import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import MarketingLayout from "@/app/(marketing)/layout";
import HomePage from "@/app/(marketing)/page";

// 仕様書: docs/specs/P0-3_プライバシーポリシーと利用規約.md S4
// (marketing)レイアウト×トップページの連携(結合レベル)

describe("(marketing)レイアウトとトップページ", () => {
  it("S4: トップページのフッターに /privacy と /terms へのリンクが存在する", () => {
    render(
      <MarketingLayout>
        <HomePage />
      </MarketingLayout>,
    );

    const privacyLink = screen.getByRole("link", {
      name: "プライバシーポリシー",
    });
    expect(privacyLink).toHaveAttribute("href", "/privacy");

    const termsLink = screen.getByRole("link", { name: "利用規約" });
    expect(termsLink).toHaveAttribute("href", "/terms");
  });

  // 仕様書: docs/specs/P4-4_料金ページ.md S7(フッターとLPの料金導線)
  it("S7: フッターに /pricing への「料金」リンクがあり、LPのベータ案内にも料金リンクがある", () => {
    render(
      <MarketingLayout>
        <HomePage />
      </MarketingLayout>,
    );

    const footerLink = screen.getByRole("link", { name: "料金" });
    expect(footerLink).toHaveAttribute("href", "/pricing");

    const betaLink = screen.getByRole("link", {
      name: "料金(Pro近日公開)を見る",
    });
    expect(betaLink).toHaveAttribute("href", "/pricing");
  });
});
