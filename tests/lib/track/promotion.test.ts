import { describe, expect, it } from "vitest";
import { buildPromotionDefaults } from "@/lib/track/promotion";

// 仕様書: docs/specs/P2-6_計測画面.md S4
// 昇格フォームの初期値 = タイトル引き継ぎ・翌日の同時刻・実績と同じ長さ

describe("buildPromotionDefaults", () => {
  it("S4: 開始10:00〜終了11:30のフリー実績から、翌日10:00〜11:30の初期値が返る", () => {
    const start = new Date(2026, 6, 11, 10, 0, 0, 0);
    const end = new Date(2026, 6, 11, 11, 30, 0, 0);

    const defaults = buildPromotionDefaults({
      title: "リファクタリング",
      startAt: start.toISOString(),
      endAt: end.toISOString(),
    });

    expect(defaults.title).toBe("リファクタリング");
    expect(defaults.startAt).toBe(
      new Date(2026, 6, 12, 10, 0, 0, 0).toISOString(),
    );
    expect(defaults.endAt).toBe(
      new Date(2026, 6, 12, 11, 30, 0, 0).toISOString(),
    );
  });

  it("S4補: 日をまたぐ実績でも長さが維持される", () => {
    const start = new Date(2026, 6, 11, 23, 30, 0, 0);
    const end = new Date(2026, 6, 12, 0, 30, 0, 0);

    const defaults = buildPromotionDefaults({
      title: "深夜作業",
      startAt: start.toISOString(),
      endAt: end.toISOString(),
    });

    expect(defaults.startAt).toBe(
      new Date(2026, 6, 12, 23, 30, 0, 0).toISOString(),
    );
    expect(defaults.endAt).toBe(
      new Date(2026, 6, 13, 0, 30, 0, 0).toISOString(),
    );
  });
});
