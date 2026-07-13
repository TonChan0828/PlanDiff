import { describe, expect, it } from "vitest";
import { ERROR_PAGE_MESSAGES } from "@/lib/errors/messages";

// 仕様書: docs/specs/P4-5_磨き込み.md S6
// エラー境界の文言集約がすべて日本語であること

const JAPANESE_PATTERN = /[ぁ-んァ-ヶ一-龠]/;

describe("エラー境界の文言(lib/errors/messages)", () => {
  it("S6: すべての文言が日本語を含む", () => {
    const values = Object.values(ERROR_PAGE_MESSAGES).flatMap((group) =>
      Object.values(group),
    );
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) {
      expect(value, `文言が日本語ではありません: ${value}`).toMatch(
        JAPANESE_PATTERN,
      );
    }
  });
});
