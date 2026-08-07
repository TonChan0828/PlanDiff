import { describe, expect, it } from "vitest";
import { config } from "@/proxy";

// 仕様書: docs/specs/P6-1_サーバー往復の集約.md S14・S15
// matcher の正規表現そのものを検証する(Next のルーティングを通さずロジックだけを固定する)。

const matcher = config.matcher[0]!;
const pattern = new RegExp(`^${matcher}$`);

function passesProxy(pathname: string): boolean {
  return pattern.test(pathname);
}

describe("Proxy を通さないパス(S14)", () => {
  it.each(["/", "/pricing", "/privacy", "/terms"])(
    "S14: %s は Proxy を通らない(認証往復が入らない)",
    (pathname) => {
      expect(passesProxy(pathname)).toBe(false);
    },
  );

  it("S14: 静的アセットは従来どおり除外される", () => {
    expect(passesProxy("/icon.svg")).toBe(false);
    expect(passesProxy("/_next/static/chunk.js")).toBe(false);
  });
});

describe("Proxy を通すパス(S15)", () => {
  it.each([
    "/calendar",
    "/track",
    "/summary",
    "/settings",
    "/onboarding",
    "/login",
    "/signup",
    "/reset-password",
    "/forgot-password",
    "/api/calendar/sync",
    "/auth/confirm",
  ])("S15: %s は従来どおり Proxy を通る", (pathname) => {
    expect(passesProxy(pathname)).toBe(true);
  });

  it("S15: 除外対象と前方一致するだけのパスは通す", () => {
    // /pricing だけを除外しており、配下や類似名は対象外
    expect(passesProxy("/pricing/detail")).toBe(true);
    expect(passesProxy("/terms-of-use")).toBe(true);
  });
});
