import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ getGoogleRefreshToken: vi.fn() }));
vi.mock("@/lib/calendar/events", () => ({
  fetchSyncedEvents: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/timer/entries", () => ({
  fetchTimeEntries: vi.fn().mockResolvedValue([]),
  fetchRunningEntry: vi.fn().mockResolvedValue(null),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
// CalendarViewは同期fetch等を持つクライアント側の関心のためスタブする(ヘッダー構成の検証が目的)
vi.mock("@/components/calendar-view", () => ({
  CalendarView: () => <div data-testid="calendar-view" />,
}));

import { createClient } from "@/lib/supabase/server";
import CalendarPage from "@/app/(app)/calendar/page";

// 仕様書: docs/specs/D-1-2_デザイン刷新.md S5(ナビのタブ集約)

const createClientMock = vi.mocked(createClient);

beforeEach(() => {
  vi.clearAllMocks();
  createClientMock.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "u1", email: "user@example.com" } },
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { onboarded_at: "2026-07-01T00:00:00Z" },
          }),
        }),
      }),
    }),
  } as unknown as Awaited<ReturnType<typeof createClient>>);
});

describe("カレンダーページのヘッダー(S5)", () => {
  it("S5: ピルナビ(計測/サマリー/設定)・ログアウト・ログイン中表示を含まない", async () => {
    render(await CalendarPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByTestId("calendar-view")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "ログアウト" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "計測" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "サマリー" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "設定" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/さんとしてログイン中/)).not.toBeInTheDocument();
  });

  it("S5: 見出し(カレンダー)はスクリーンリーダー向けに維持される", async () => {
    render(await CalendarPage({ searchParams: Promise.resolve({}) }));

    expect(
      screen.getByRole("heading", { name: "カレンダー" }),
    ).toBeInTheDocument();
  });
});
