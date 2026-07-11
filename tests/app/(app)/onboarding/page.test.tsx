import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import OnboardingPage from "@/app/(app)/onboarding/page";

// 仕様書: docs/specs/P4-1_オンボーディング.md S8(エラー表示側)・S10

describe("オンボーディングページ", () => {
  it("S10: エラーなしでステップ1が表示される(状態に関わらず直接アクセス可能)", async () => {
    render(await OnboardingPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("予定を立てる")).toBeInTheDocument();
  });

  it("S8: error=save_failedの場合は日本語エラーメッセージが表示される", async () => {
    render(
      await OnboardingPage({
        searchParams: Promise.resolve({ error: "save_failed" }),
      }),
    );

    expect(
      screen.getByText("保存に失敗しました。もう一度お試しください"),
    ).toBeInTheDocument();
  });
});
