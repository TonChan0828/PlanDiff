import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { usePathnameMock } = vi.hoisted(() => ({
  usePathnameMock: vi.fn<() => string>(),
}));
vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));

import { BottomTabBar } from "@/components/bottom-tab-bar";

// 仕様書: docs/specs/D-1-2_デザイン刷新.md S1・S2・S3

beforeEach(() => {
  vi.clearAllMocks();
});

describe("BottomTabBar(S1〜S3)", () => {
  it("S1: 4タブが表示され、現在のページ(カレンダー)のみaria-current=pageを持つ", () => {
    usePathnameMock.mockReturnValue("/calendar");
    render(<BottomTabBar />);

    const calendar = screen.getByRole("link", { name: "カレンダー" });
    const track = screen.getByRole("link", { name: "計測" });
    const summary = screen.getByRole("link", { name: "サマリー" });
    const settings = screen.getByRole("link", { name: "設定" });

    expect(calendar).toHaveAttribute("href", "/calendar");
    expect(track).toHaveAttribute("href", "/track");
    expect(summary).toHaveAttribute("href", "/summary");
    expect(settings).toHaveAttribute("href", "/settings");

    expect(calendar).toHaveAttribute("aria-current", "page");
    expect(track).not.toHaveAttribute("aria-current");
    expect(summary).not.toHaveAttribute("aria-current");
    expect(settings).not.toHaveAttribute("aria-current");
  });

  it("S2: サブパスでも該当タブがアクティブになる(境界値。クエリはpathnameに含まれない)", () => {
    // ?view=week&date=... のようなクエリ付きURLでは usePathname は "/calendar" を
    // 返すため、境界値としてサブパスでの前方一致を検証する
    usePathnameMock.mockReturnValue("/calendar/2026-07-06");
    render(<BottomTabBar />);

    expect(screen.getByRole("link", { name: "カレンダー" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "計測" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("S3: タブ対象外のパス(/onboarding)ではどのタブもアクティブにならない(異常系)", () => {
    usePathnameMock.mockReturnValue("/onboarding");
    render(<BottomTabBar />);

    for (const name of ["カレンダー", "計測", "サマリー", "設定"]) {
      expect(screen.getByRole("link", { name })).not.toHaveAttribute(
        "aria-current",
      );
    }
  });
});
