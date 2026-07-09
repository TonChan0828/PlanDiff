import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  getGoogleRefreshToken: vi.fn(),
  deleteGoogleRefreshToken: vi.fn(),
}));

import { getGoogleRefreshToken } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import SettingsPage from "@/app/(app)/settings/page";

// 仕様書: docs/specs/P1-3_メール認証とGoogle任意連携.md S21

const createClientMock = vi.mocked(createClient);
const getGoogleRefreshTokenMock = vi.mocked(getGoogleRefreshToken);

beforeEach(() => {
  vi.clearAllMocks();
  createClientMock.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
    },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
});

describe("設定ページ", () => {
  it("S21: 連携済みの場合は「連携済み」表示と解除ボタンが表示される", async () => {
    getGoogleRefreshTokenMock.mockResolvedValue({
      ok: true,
      refreshToken: "rt-1",
    });

    render(await SettingsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("連携済み")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "連携を解除" }),
    ).toBeInTheDocument();
  });

  it("未連携の場合は「未連携」表示と連携リンクが表示される", async () => {
    getGoogleRefreshTokenMock.mockResolvedValue({
      ok: true,
      refreshToken: null,
    });

    render(await SettingsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("未連携")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "連携する" })).toHaveAttribute(
      "href",
      "/api/google/connect",
    );
  });

  it("connected=1 の場合は連携成功メッセージが表示される", async () => {
    getGoogleRefreshTokenMock.mockResolvedValue({
      ok: true,
      refreshToken: "rt-1",
    });

    render(
      await SettingsPage({
        searchParams: Promise.resolve({ connected: "1" }),
      }),
    );

    expect(
      screen.getByText("Googleカレンダーと連携しました"),
    ).toBeInTheDocument();
  });

  it("error=google_no_refresh_token の場合は該当エラーメッセージが表示される", async () => {
    getGoogleRefreshTokenMock.mockResolvedValue({
      ok: true,
      refreshToken: null,
    });

    render(
      await SettingsPage({
        searchParams: Promise.resolve({ error: "google_no_refresh_token" }),
      }),
    );

    expect(
      screen.getByText(
        "オフラインアクセスの許可が必要です。もう一度連携をやり直し、アクセス許可画面ですべての権限を許可してください",
      ),
    ).toBeInTheDocument();
  });
});
