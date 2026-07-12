import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  getGoogleRefreshToken: vi.fn(),
  deleteGoogleRefreshToken: vi.fn(),
  deleteUserAccount: vi.fn(),
}));

import { getGoogleRefreshToken } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import SettingsPage from "@/app/(app)/settings/page";

// 仕様書: docs/specs/P1-3_メール認証とGoogle任意連携.md S21
// 仕様書: docs/specs/P2-5_アプリ内予定とGoogle連携凍結.md S17(凍結フラグ)
// 仕様書: docs/specs/P4-2_設定画面.md S1・S2・S9・S12

const createClientMock = vi.mocked(createClient);
const getGoogleRefreshTokenMock = vi.mocked(getGoogleRefreshToken);

beforeEach(() => {
  vi.clearAllMocks();
  // P2-5: フラグ未設定=凍結のため、既存(P1-3)のシナリオはフラグONで検証する
  vi.stubEnv("GOOGLE_INTEGRATION_ENABLED", "true");
  createClientMock.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "u1", email: "user@example.com" } },
      }),
    },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
});

afterEach(() => {
  vi.unstubAllEnvs();
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

  it("P2-5 S17: 凍結フラグOFFではGoogle連携セクションが表示されず、トークンも読まれない", async () => {
    vi.stubEnv("GOOGLE_INTEGRATION_ENABLED", "");

    render(await SettingsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.queryByText("Googleカレンダー連携")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "連携する" }),
    ).not.toBeInTheDocument();
    expect(getGoogleRefreshTokenMock).not.toHaveBeenCalled();
  });

  it("P2-5 S17: 凍結フラグONではGoogle連携セクションが従来どおり表示される", async () => {
    getGoogleRefreshTokenMock.mockResolvedValue({
      ok: true,
      refreshToken: null,
    });

    render(await SettingsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("Googleカレンダー連携")).toBeInTheDocument();
  });

  it("P4-2 S1: アカウントセクションにメールアドレスが表示される", async () => {
    getGoogleRefreshTokenMock.mockResolvedValue({
      ok: true,
      refreshToken: null,
    });

    render(await SettingsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("アカウント")).toBeInTheDocument();
    expect(screen.getByText("user@example.com")).toBeInTheDocument();
  });

  it("P4-2 S2: ログアウトボタンが表示される", async () => {
    getGoogleRefreshTokenMock.mockResolvedValue({
      ok: true,
      refreshToken: null,
    });

    render(await SettingsPage({ searchParams: Promise.resolve({}) }));

    expect(
      screen.getByRole("button", { name: "ログアウト" }),
    ).toBeInTheDocument();
  });

  it("P4-2 S9: error=account_delete_failed は凍結中でも日本語エラーが表示される", async () => {
    vi.stubEnv("GOOGLE_INTEGRATION_ENABLED", "");

    render(
      await SettingsPage({
        searchParams: Promise.resolve({ error: "account_delete_failed" }),
      }),
    );

    expect(
      screen.getByText(
        "アカウントの削除に失敗しました。時間をおいてもう一度お試しください",
      ),
    ).toBeInTheDocument();
  });

  it("P4-1 導線: 「使い方をもう一度見る」リンクが/onboardingを指す", async () => {
    getGoogleRefreshTokenMock.mockResolvedValue({
      ok: true,
      refreshToken: null,
    });

    render(await SettingsPage({ searchParams: Promise.resolve({}) }));

    expect(
      screen.getByRole("link", { name: "使い方をもう一度見る" }),
    ).toHaveAttribute("href", "/onboarding");
  });

  it("P4-2 S12: 凍結中でもアカウント・ログアウト・削除セクションは表示される", async () => {
    vi.stubEnv("GOOGLE_INTEGRATION_ENABLED", "");

    render(await SettingsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.queryByText("Googleカレンダー連携")).not.toBeInTheDocument();
    expect(screen.getByText("アカウント")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "ログアウト" }),
    ).toBeInTheDocument();
    expect(screen.getByText("危険な操作")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "アカウントを削除" }),
    ).toBeInTheDocument();
  });

  it("D-1-2 S14: 外観セクション(ライト/ダーク/システムの3択)が表示される", async () => {
    getGoogleRefreshTokenMock.mockResolvedValue({
      ok: true,
      refreshToken: null,
    });

    render(await SettingsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("外観")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "ライト" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "ダーク" })).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "システムに合わせる" }),
    ).toBeInTheDocument();
  });
});
