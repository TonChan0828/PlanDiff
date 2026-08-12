import { describe, expect, it, vi } from "vitest";

const { cookiesMock } = vi.hoisted(() => ({ cookiesMock: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: cookiesMock }));

import { readTimezoneCookie } from "@/lib/time/timezone-cookie.server";
import { TIMEZONE_COOKIE_NAME } from "@/lib/time/timezone-cookie";

// 仕様書: docs/specs/P8-3_サマリーの日付またぎとTZ非対称の是正.md S4〜S6

function mockCookieStore(value: string | undefined) {
  cookiesMock.mockResolvedValue({
    get: (name: string) =>
      name === TIMEZONE_COOKIE_NAME && value !== undefined
        ? { value }
        : undefined,
  });
}

describe("readTimezoneCookie", () => {
  it("S4: Cookie未設定ならnullを返す", async () => {
    mockCookieStore(undefined);
    expect(await readTimezoneCookie()).toBeNull();
  });

  it("S5: 妥当なIANA形式のCookie値を返す", async () => {
    mockCookieStore("Asia/Tokyo");
    expect(await readTimezoneCookie()).toBe("Asia/Tokyo");
  });

  it("S6: 不正な形式のCookie値はnullを返す(境界値)", async () => {
    mockCookieStore("'; DROP TABLE users; --");
    expect(await readTimezoneCookie()).toBeNull();

    mockCookieStore("a".repeat(65));
    expect(await readTimezoneCookie()).toBeNull();
  });
});
