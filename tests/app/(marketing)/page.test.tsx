import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import HomePage from "@/app/(marketing)/page";

// 仕様書: docs/specs/D-3_サマリーヒーローとLP.md S6・S7(LP)

describe("LP(S6 / S7)", () => {
  it("S6: 見出し・サブコピー・CTA(無料で始める→/signup、ログイン→/login)が表示される", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", {
        name: /見積もりが、\s*当たるようになる。/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/計画と現実のズレをdiffのように読む/),
    ).toBeInTheDocument();

    for (const link of screen.getAllByRole("link", { name: "無料で始める" })) {
      expect(link).toHaveAttribute("href", "/signup");
    }
    expect(
      screen.getAllByRole("link", { name: "無料で始める" }).length,
    ).toBeGreaterThanOrEqual(2);
    for (const link of screen.getAllByRole("link", { name: "ログイン" })) {
      expect(link).toHaveAttribute("href", "/login");
    }
  });

  it("S7: 機能3件・使い方3ステップ・ベータ案内(Google連携は準備中)が表示される", () => {
    render(<HomePage />);

    // 機能3件
    expect(screen.getByText("重ねて、ズレを見る")).toBeInTheDocument();
    expect(screen.getByText("ワンタップで記録")).toBeInTheDocument();
    expect(screen.getByText("ズレをdiffで読む")).toBeInTheDocument();

    // 使い方3ステップ
    expect(screen.getByText("予定を置く")).toBeInTheDocument();
    expect(screen.getByText("タイマーで記録する")).toBeInTheDocument();
    expect(screen.getByText("ズレを読む")).toBeInTheDocument();

    // ベータ案内(凍結中の機能を提供中と書かない)
    expect(
      screen.getByText(/現在ベータ版・無料でご利用いただけます/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Googleカレンダー連携は準備中です/),
    ).toBeInTheDocument();
  });
});
