import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RowLimitExceededError } from "@/lib/errors/row-limit";
import { SUMMARY_MESSAGES as S } from "@/lib/summary/messages";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/calendar/events", () => ({ fetchSyncedEventsInRange: vi.fn() }));
vi.mock("@/lib/calendar/recurring", () => ({
  materializeRecurringInstances: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/timer/entries", () => ({
  fetchTimeEntriesInRange: vi.fn().mockResolvedValue([]),
  fetchRunningEntry: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/time/timezone-cookie.server", () => ({
  readTimezoneCookie: vi.fn().mockResolvedValue(null),
}));

import { fetchSyncedEventsInRange } from "@/lib/calendar/events";
import SummaryPage from "@/app/(app)/summary/page";

// 仕様書: docs/specs/P6-0_サマリー集計の行数上限.md S20・S21

const fetchEventsMock = vi.mocked(fetchSyncedEventsInRange);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("行数上限に達したときのサマリー表示(S20・S21)", () => {
  it("S20: RowLimitExceededErrorなら理由を日本語で表示し、集計セクションを描画しない", async () => {
    fetchEventsMock.mockRejectedValue(new RowLimitExceededError(20000));

    render(await SummaryPage({ searchParams: Promise.resolve({}) }));

    const alert = screen.getByTestId("summary-range-error");
    expect(alert).toHaveTextContent(S.rangeTooManyRows);
    // 期間タブは残り、集計結果は出ない
    expect(screen.getByRole("link", { name: S.todayTab })).toBeInTheDocument();
    expect(screen.queryByText(S.itemsHeading)).not.toBeInTheDocument();
    expect(screen.queryByText(S.planTotal)).not.toBeInTheDocument();
  });

  it("S21: 通常のエラーは握りつぶさず再送出する(エラー境界に委ねる)", async () => {
    fetchEventsMock.mockRejectedValue(
      new Error("予定の読み込みに失敗しました"),
    );

    await expect(
      SummaryPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("予定の読み込みに失敗しました");
  });
});
