import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const { routerMock } = vi.hoisted(() => ({
  routerMock: { refresh: vi.fn() },
}));
vi.mock("next/navigation", () => ({ useRouter: () => routerMock }));

import { TimezoneSync } from "@/components/timezone-sync";
import { TIMEZONE_COOKIE_NAME } from "@/lib/time/timezone-cookie";

// 仕様書: docs/specs/P8-3_サマリーの日付またぎとTZ非対称の是正.md S12〜S15

function clearCookie() {
  document.cookie = `${TIMEZONE_COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`;
}

function setCookie(value: string) {
  document.cookie = `${TIMEZONE_COOKIE_NAME}=${encodeURIComponent(value)}; path=/`;
}

function readCookie(): string | null {
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${TIMEZONE_COOKIE_NAME}=([^;]*)`),
  );
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

beforeEach(() => {
  vi.clearAllMocks();
  clearCookie();
});

afterEach(() => {
  clearCookie();
  vi.restoreAllMocks();
});

describe("TimezoneSync", () => {
  it("S12: Cookie未設定なら検出したTZを書き込みrouter.refreshが1回呼ばれる", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockReturnValue({
      resolvedOptions: () => ({ timeZone: "Asia/Tokyo" }),
    } as unknown as Intl.DateTimeFormat);

    render(<TimezoneSync />);

    expect(readCookie()).toBe("Asia/Tokyo");
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
  });

  it("S13: Cookieが検出したTZと一致するときは書き込み・refreshのいずれも発生しない", () => {
    setCookie("Asia/Tokyo");
    vi.spyOn(Intl, "DateTimeFormat").mockReturnValue({
      resolvedOptions: () => ({ timeZone: "Asia/Tokyo" }),
    } as unknown as Intl.DateTimeFormat);

    render(<TimezoneSync />);

    expect(readCookie()).toBe("Asia/Tokyo");
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });

  it("S14: Cookieが検出したTZと異なるときは書き換えてrefreshが1回呼ばれる", () => {
    setCookie("Pacific/Kiritimati");
    vi.spyOn(Intl, "DateTimeFormat").mockReturnValue({
      resolvedOptions: () => ({ timeZone: "Asia/Tokyo" }),
    } as unknown as Intl.DateTimeFormat);

    render(<TimezoneSync />);

    expect(readCookie()).toBe("Asia/Tokyo");
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
  });

  it("S15: 可視要素を描画しない", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockReturnValue({
      resolvedOptions: () => ({ timeZone: "Asia/Tokyo" }),
    } as unknown as Intl.DateTimeFormat);

    const { container } = render(<TimezoneSync />);

    expect(container.firstChild).toBeNull();
  });
});
