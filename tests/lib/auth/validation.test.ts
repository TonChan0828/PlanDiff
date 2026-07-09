import { describe, expect, it } from "vitest";
import { isValidEmail, isValidPassword } from "@/lib/auth/validation";

// 仕様書: docs/specs/P1-3_メール認証とGoogle任意連携.md S2 / S3

describe("isValidEmail", () => {
  it("S2: 正しい形式のメールアドレスはtrueを返す", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
  });

  it("S2: 不正な形式のメールアドレスはfalseを返す", () => {
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("user@")).toBe(false);
    expect(isValidEmail("@example.com")).toBe(false);
  });
});

describe("isValidPassword", () => {
  it("S3: 境界値。7文字はfalse、8文字はtrueを返す", () => {
    expect(isValidPassword("1234567")).toBe(false);
    expect(isValidPassword("12345678")).toBe(true);
  });
});
