import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ getGoogleRefreshToken: vi.fn() }));
vi.mock("@/lib/calendar/events", () => ({
  fetchSyncedEvents: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/calendar/recurring", () => ({
  materializeRecurringInstances: vi.fn().mockResolvedValue([]),
  fetchRecurringRules: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/timer/entries", () => ({
  fetchTimeEntries: vi.fn().mockResolvedValue([]),
  fetchRunningEntry: vi.fn().mockResolvedValue(null),
  fetchSuggestionSourceEntries: vi.fn().mockResolvedValue([]),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const calendarViewProps = vi.fn();
vi.mock("@/components/calendar-view", () => ({
  CalendarView: (props: Record<string, unknown>) => {
    calendarViewProps(props);
    return <div data-testid="calendar-view" />;
  },
}));

import { redirect } from "next/navigation";
import {
  fetchRecurringRules,
  materializeRecurringInstances,
} from "@/lib/calendar/recurring";
import { createClient } from "@/lib/supabase/server";
import CalendarPage from "@/app/(app)/calendar/page";

// 仕様書: docs/specs/P6-1_サーバー往復の集約.md S9〜S11

const createClientMock = vi.mocked(createClient);
const materializeMock = vi.mocked(materializeRecurringInstances);
const fetchRulesMock = vi.mocked(fetchRecurringRules);
const redirectMock = vi.mocked(redirect);

const RULE = {
  id: "rule-1",
  title: "朝会",
  pattern: "daily" as const,
  weekdays: null,
  startTime: "09:00",
  endTime: "09:30",
  timezone: "Asia/Tokyo",
  startsOn: "2026-01-01",
  endsOn: null,
  origin: "manual" as const,
  lastLearnedAt: null,
};

function mockClient(onboardedAt: string | null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "u1", email: "user@example.com" } },
        error: null,
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi
            .fn()
            .mockResolvedValue({ data: { onboarded_at: onboardedAt } }),
        }),
      }),
    }),
  } as unknown as Awaited<ReturnType<typeof createClient>>;
}

beforeEach(() => {
  vi.clearAllMocks();
  createClientMock.mockResolvedValue(mockClient("2026-07-01T00:00:00Z"));
  materializeMock.mockResolvedValue([]);
});

describe("カレンダーページのクエリ重複解消(S9)", () => {
  it("S9: recurring_rules を二重に取らない(fetchRecurringRules を呼ばない)", async () => {
    materializeMock.mockResolvedValue([RULE]);

    render(await CalendarPage({ searchParams: Promise.resolve({}) }));

    expect(fetchRulesMock).not.toHaveBeenCalled();
  });

  it("S9: materializeRecurringInstances の戻り値が recurringRules として渡る", async () => {
    materializeMock.mockResolvedValue([RULE]);

    render(await CalendarPage({ searchParams: Promise.resolve({}) }));

    expect(calendarViewProps).toHaveBeenCalledWith(
      expect.objectContaining({ recurringRules: [RULE] }),
    );
  });
});

describe("並列化してもオンボ判定が変わらないこと(S10・S11)", () => {
  it("S10: onboarded_at が null なら /onboarding へリダイレクトする", async () => {
    createClientMock.mockResolvedValue(mockClient(null));

    await CalendarPage({ searchParams: Promise.resolve({}) });

    expect(redirectMock).toHaveBeenCalledWith("/onboarding");
  });

  it("S11: 実体化が失敗(空配列)してもオンボ判定は従来どおり機能する", async () => {
    createClientMock.mockResolvedValue(mockClient(null));
    materializeMock.mockResolvedValue([]);

    await CalendarPage({ searchParams: Promise.resolve({}) });

    expect(redirectMock).toHaveBeenCalledWith("/onboarding");
  });

  it("S11: オンボ済みならリダイレクトせず描画する", async () => {
    render(await CalendarPage({ searchParams: Promise.resolve({}) }));

    expect(redirectMock).not.toHaveBeenCalled();
    expect(calendarViewProps).toHaveBeenCalled();
  });
});
