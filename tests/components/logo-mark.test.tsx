import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import { LogoMark } from "@/components/logo-mark";

// 仕様書: docs/specs/D-5_ロゴ作成.md S1・S2

describe("LogoMark(S1〜S2)", () => {
  it("S1: svgがviewBoxとaria-hiddenを持ち、予定/実績の2ブロック(rect2つ以上)を含む", () => {
    const { container } = render(<LogoMark />);

    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("viewBox");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg?.querySelectorAll("rect").length).toBeGreaterThanOrEqual(2);
  });

  it("S2: classNameがルートsvgに適用される", () => {
    const { container } = render(<LogoMark className="h-6 w-6" />);

    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("h-6", "w-6");
  });
});
