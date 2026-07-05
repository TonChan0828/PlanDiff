import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

// テスト基盤(Vitest + jsdom + Testing Library)が機能することを確認するスモークテスト。
// 機能テストは docs/specs/ の仕様書のテストシナリオから展開すること。
describe("テスト基盤", () => {
  it("Reactコンポーネントをレンダリングして検証できる", () => {
    render(<h1>PlanDiff</h1>);
    expect(
      screen.getByRole("heading", { name: "PlanDiff" }),
    ).toBeInTheDocument();
  });
});
