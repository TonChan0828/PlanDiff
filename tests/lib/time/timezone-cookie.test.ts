import { describe, expect, it } from "vitest";
import { isValidTimezoneValue } from "@/lib/time/timezone-cookie";

// 仕様書: docs/specs/P8-3_サマリーの日付またぎとTZ非対称の是正.md S4〜S6
// (readTimezoneCookieのテストは next/headers 依存のため
// tests/lib/time/timezone-cookie.server.test.ts に分離)

describe("isValidTimezoneValue", () => {
  it("IANA名の形式を通す", () => {
    expect(isValidTimezoneValue("Asia/Tokyo")).toBe(true);
    expect(isValidTimezoneValue("Pacific/Kiritimati")).toBe(true);
    expect(isValidTimezoneValue("UTC")).toBe(true);
  });

  it("許可文字集合外・長すぎる値を弾く", () => {
    expect(isValidTimezoneValue("Asia/Tokyo; DROP TABLE")).toBe(false);
    expect(isValidTimezoneValue("a".repeat(65))).toBe(false);
    expect(isValidTimezoneValue("")).toBe(false);
  });
});
