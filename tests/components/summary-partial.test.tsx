import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  SummaryPartialBadge,
  SummaryPartialProgress,
} from "@/components/summary-partial";

// 仕様書: docs/specs/G-90_サマリーの途中経過と最終結果の分離.md A11・A12
// props は計算済みの値のみ。モックは不要。

describe("SummaryPartialBadge(G-90)", () => {
  it("A11: 「途中経過」と「現時点まで」を文言で示す", () => {
    render(<SummaryPartialBadge />);

    expect(screen.getByTestId("gap-hero-partial-badge")).toHaveTextContent(
      "途中経過",
    );
    expect(screen.getByTestId("gap-hero-partial-badge")).toHaveTextContent(
      "現時点まで",
    );
  });
});

describe("SummaryPartialProgress(G-90)", () => {
  it("A11: 経過した予定の進み具合と、このあとの予定を出す", () => {
    render(
      <SummaryPartialProgress
        elapsedCount={2}
        totalCount={3}
        upcomingCount={1}
        upcomingMinutes={280}
      />,
    );

    expect(screen.getByTestId("gap-hero-progress")).toHaveTextContent(
      "経過した予定 2件 / 全 3件",
    );
    expect(screen.getByTestId("gap-hero-upcoming")).toHaveTextContent(
      "このあと 予定 1件(計画 4:40)",
    );
  });

  it("A12: これからの予定が0件なら「このあと」の行を出さない", () => {
    render(
      <SummaryPartialProgress
        elapsedCount={3}
        totalCount={3}
        upcomingCount={0}
        upcomingMinutes={0}
      />,
    );

    expect(screen.getByTestId("gap-hero-progress")).toBeInTheDocument();
    expect(screen.queryByTestId("gap-hero-upcoming")).not.toBeInTheDocument();
  });

  it("予定が1件もない期間では、何も出さない", () => {
    const { container } = render(
      <SummaryPartialProgress
        elapsedCount={0}
        totalCount={0}
        upcomingCount={0}
        upcomingMinutes={0}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
