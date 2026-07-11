import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { usePathnameMock, redirectMock } = vi.hoisted(() => ({
  usePathnameMock: vi.fn<() => string>(),
  redirectMock: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: usePathnameMock,
  redirect: redirectMock,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import AppLayout from "@/app/(app)/layout";

// 仕様書: docs/specs/D-1-2_デザイン刷新.md S8
// (app)レイアウト↔シェル(AppBar/BottomTabBar)のコンポーネント間連携を検証する

const createClientMock = vi.mocked(createClient);

beforeEach(() => {
  vi.clearAllMocks();
  usePathnameMock.mockReturnValue("/calendar");
  createClientMock.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "u1", email: "user@example.com" } },
        error: null,
      }),
    },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
});

describe("(app)レイアウトの共通シェル(S8)", () => {
  it("S8: 認証済みならワードマーク・タブナビ・子コンテンツがすべて描画される", async () => {
    render(await AppLayout({ children: <p>ページ本文</p> }));

    // ワードマーク(AppBar)
    expect(screen.getByRole("link", { name: "PlanDiff" })).toBeInTheDocument();
    // 下部タブ(BottomTabBar)4件
    expect(screen.getByRole("link", { name: "カレンダー" })).toHaveAttribute(
      "href",
      "/calendar",
    );
    expect(screen.getByRole("link", { name: "計測" })).toHaveAttribute(
      "href",
      "/track",
    );
    expect(screen.getByRole("link", { name: "サマリー" })).toHaveAttribute(
      "href",
      "/summary",
    );
    expect(screen.getByRole("link", { name: "設定" })).toHaveAttribute(
      "href",
      "/settings",
    );
    // 子コンテンツ
    expect(screen.getByText("ページ本文")).toBeInTheDocument();
  });

  it("S8: 未認証なら/loginへリダイレクトする(既存挙動の維持)", async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi
          .fn()
          .mockResolvedValue({ data: { user: null }, error: null }),
      },
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    await AppLayout({ children: <p>ページ本文</p> });

    expect(redirectMock).toHaveBeenCalledWith("/login");
  });
});
