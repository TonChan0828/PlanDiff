import { describe, expect, it } from "vitest";
import { shouldRedirectToOnboarding } from "@/lib/onboarding/status";

// 仕様書: docs/specs/P4-1_オンボーディング.md S6・S7
// calendar/page.tsx が使うリダイレクト判定ロジックを純粋関数として検証する
// (calendar/page.tsx自体は既存の慣習どおり専用テストを持たず、抽出したlib関数で検証する)

describe("shouldRedirectToOnboarding", () => {
  it("S6: onboarded_atがnullのプロフィールはリダイレクト対象", () => {
    expect(shouldRedirectToOnboarding({ onboarded_at: null })).toBe(true);
  });

  it("S7: onboarded_atが設定済みのプロフィールはリダイレクト対象外", () => {
    expect(
      shouldRedirectToOnboarding({ onboarded_at: "2026-07-11T00:00:00Z" }),
    ).toBe(false);
  });

  it("profile取得失敗(null)時はリダイレクトしない", () => {
    expect(shouldRedirectToOnboarding(null)).toBe(false);
  });
});
