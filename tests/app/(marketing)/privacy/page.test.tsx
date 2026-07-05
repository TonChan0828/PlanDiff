import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PrivacyPage from "@/app/(marketing)/privacy/page";

// 仕様書: docs/specs/P0-3_プライバシーポリシーと利用規約.md S1 / S3

describe("プライバシーポリシーページ", () => {
  it("S1: 見出しと必須セクション(取得する情報 / Limited Use準拠宣言 / データの削除 / お問い合わせ)が表示される", () => {
    render(<PrivacyPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "プライバシーポリシー" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /取得する情報/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Limited Use/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /データの削除/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /お問い合わせ/ }),
    ).toBeInTheDocument();

    // Limited Use 準拠宣言の必須文言(日本語)と英文併記
    expect(screen.getByText(/Limited Use の要件を含む/)).toBeInTheDocument();
    expect(
      screen.getByText(/including the Limited Use requirements/),
    ).toBeInTheDocument();
  });

  it("S3: Google API Services User Data Policy へのリンクが存在する", () => {
    render(<PrivacyPage />);

    const links = screen
      .getAllByRole("link")
      .filter(
        (link) =>
          link.getAttribute("href") ===
          "https://developers.google.com/terms/api-services-user-data-policy",
      );
    expect(links.length).toBeGreaterThanOrEqual(1);
  });
});
