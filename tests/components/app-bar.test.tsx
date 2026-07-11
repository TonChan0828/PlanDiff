import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { AppBar } from "@/components/app-bar";

// 仕様書: docs/specs/D-1-2_デザイン刷新.md S6

describe("AppBar(S6)", () => {
  it("S6: ワードマーク(PlanDiff)が/calendarへのリンクとして表示される", () => {
    render(<AppBar />);

    expect(screen.getByRole("link", { name: "PlanDiff" })).toHaveAttribute(
      "href",
      "/calendar",
    );
  });

  it("S6: ページ固有アクション(children)が表示される", () => {
    render(
      <AppBar>
        <button type="button">アクション</button>
      </AppBar>,
    );

    expect(
      screen.getByRole("button", { name: "アクション" }),
    ).toBeInTheDocument();
  });
});
