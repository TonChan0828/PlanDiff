import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const { usePathnameMock } = vi.hoisted(() => ({
  usePathnameMock: vi.fn<() => string>(),
}));
vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));

import { AppBar } from "@/components/app-bar";
import { DesktopNav } from "@/components/desktop-nav";
import { MarketingHeader } from "@/components/marketing-header";

// 仕様書: docs/specs/D-5_ロゴ作成.md S5

beforeEach(() => {
  vi.clearAllMocks();
  usePathnameMock.mockReturnValue("/calendar");
});

describe("ヘッダーのロゴマーク表示(S5)", () => {
  it("S5: AppBarのヘッダー内にロゴマーク(svg)が表示される", () => {
    const { container } = render(<AppBar />);

    expect(
      container.querySelector("header svg[aria-hidden='true']"),
    ).not.toBeNull();
  });

  it("S5: MarketingHeaderのヘッダー内にロゴマーク(svg)が表示される", () => {
    usePathnameMock.mockReturnValue("/");
    const { container } = render(<MarketingHeader />);

    expect(
      container.querySelector("header svg[aria-hidden='true']"),
    ).not.toBeNull();
  });

  it("S5: DesktopNavのロゴリンク内にロゴマーク(svg)が表示される", () => {
    const { container } = render(<DesktopNav />);

    expect(
      container.querySelector(
        "a[aria-label='PlanDiff'] svg[aria-hidden='true']",
      ),
    ).not.toBeNull();
  });
});
