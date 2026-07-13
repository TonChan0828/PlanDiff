import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import PricingPage from "@/app/(marketing)/pricing/page";

// 仕様書: docs/specs/P4-4_料金ページ.md S1
// 料金ページの表示(Free/Pro・興味ありボタン・CTA・「予定」の明記)

beforeEach(() => {
  // ProInterestButtonがマウント時にviewを送信するためfetchをスタブする
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
  );
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("料金ページ", () => {
  it("S1: 見出し・Free(¥0)・Pro(近日公開)・興味ありボタン・無料で始めるが表示され、Proの機能に「予定」の明記がある", () => {
    render(<PricingPage />);

    expect(
      screen.getByRole("heading", { name: "料金", level: 1 }),
    ).toBeInTheDocument();

    // Free: 現在提供中の機能のみ・¥0
    expect(screen.getByRole("heading", { name: /Free/ })).toBeInTheDocument();
    expect(screen.getByText("¥0")).toBeInTheDocument();

    // Pro: 近日公開・価格は表示しない・機能は「予定」と明記
    expect(screen.getByRole("heading", { name: /Pro/ })).toBeInTheDocument();
    expect(screen.getAllByText(/近日公開/).length).toBeGreaterThan(0);
    expect(screen.getByText(/提供予定の機能/)).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: "Proに興味あり" }),
    ).toBeInTheDocument();

    const signupLink = screen.getByRole("link", { name: "無料で始める" });
    expect(signupLink).toHaveAttribute("href", "/signup");
  });
});
