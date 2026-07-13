import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Loading from "@/app/(app)/loading";

// 仕様書: docs/specs/P4-5_磨き込み.md S5
// (app)配下の遷移中にスケルトンが即時表示される

describe("アプリ内遷移のスケルトン((app)/loading)", () => {
  it("S5: スケルトンが aria-busy 付きで表示され、英語文言を含まない", () => {
    const { container } = render(<Loading />);

    const status = screen.getByRole("status", { name: "読み込み中" });
    expect(status).toHaveAttribute("aria-busy", "true");

    // 画面に英語の文言を出さない(読み上げはaria-labelの日本語で担保)
    expect(container.textContent).not.toMatch(/[A-Za-z]/);
  });
});
