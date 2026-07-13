import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import GlobalError from "@/app/global-error";

// 仕様書: docs/specs/P4-5_磨き込み.md S4
// ルートレイアウト自体の例外でも日本語画面が出る(自前のhtml/bodyを含むため
// 静的マークアップで検証する)

describe("グローバルエラー境界(global-error)", () => {
  it("S4: 日本語の見出しと「再読み込み」ボタンを含む自己完結HTMLを描画する", () => {
    const markup = renderToStaticMarkup(
      <GlobalError error={new Error("boom")} unstable_retry={() => {}} />,
    );

    expect(markup).toContain('lang="ja"');
    expect(markup).toContain("問題が発生しました");
    expect(markup).toContain("再読み込み");
    expect(markup).not.toContain("boom");
  });
});
