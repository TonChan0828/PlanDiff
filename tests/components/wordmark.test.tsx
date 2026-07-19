import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { Wordmark } from "@/components/wordmark";

// 仕様書: docs/specs/D-5_ロゴ作成.md S3・S4

describe("Wordmark(S3〜S4)", () => {
  it("S3: withMarkなしではロゴマーク(svg)を表示せず、Plan/Diffのテキストのみ表示する", () => {
    const { container } = render(<Wordmark />);

    expect(container.querySelector("svg")).toBeNull();
    expect(screen.getByLabelText("PlanDiff")).toBeInTheDocument();
    expect(container).toHaveTextContent("PlanDiff");
  });

  it("S4: withMark付きではロゴマーク(svg)とテキストが両方表示され、aria-label=PlanDiffが維持される", () => {
    const { container } = render(<Wordmark withMark />);

    expect(container.querySelector("svg")).not.toBeNull();
    expect(screen.getByLabelText("PlanDiff")).toBeInTheDocument();
    expect(container).toHaveTextContent("PlanDiff");
  });
});
