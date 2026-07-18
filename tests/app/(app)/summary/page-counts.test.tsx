import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { startOfDay } from "date-fns";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/calendar/events", () => ({ fetchSyncedEvents: vi.fn() }));
vi.mock("@/lib/calendar/recurring", () => ({
  materializeRecurringInstances: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/timer/entries", () => ({
  fetchTimeEntries: vi.fn(),
  fetchRunningEntry: vi.fn().mockResolvedValue(null),
}));

import { fetchSyncedEvents } from "@/lib/calendar/events";
import { fetchTimeEntries } from "@/lib/timer/entries";
import SummaryPage from "@/app/(app)/summary/page";

// 仕様書: docs/specs/P5-3_サマリー件数ステータス行.md S3(ステータス行の描画)

const fetchSyncedEventsMock = vi.mocked(fetchSyncedEvents);
const fetchTimeEntriesMock = vi.mocked(fetchTimeEntries);

const today = startOfDay(new Date());

function isoAt(hour: number, minute = 0): string {
  return new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
    hour,
    minute,
  ).toISOString();
}

// 計画: 予定2件(片方のみ実績あり)+割り込み1件(30分)
const planEvents = [
  {
    id: "row-1",
    googleEventId: "g-1",
    title: "API設計",
    startAt: isoAt(10, 0),
    endAt: isoAt(11, 0),
    source: "app" as const,
  },
  {
    id: "row-2",
    googleEventId: "g-2",
    title: "実装",
    startAt: isoAt(13, 0),
    endAt: isoAt(15, 0),
    source: "app" as const,
  },
];

const timeEntries = [
  {
    id: "e-1",
    title: "API設計",
    googleEventId: "g-1",
    startAt: isoAt(10, 0),
    endAt: isoAt(10, 45),
  },
  {
    id: "e-2",
    title: "障害対応",
    googleEventId: null,
    startAt: isoAt(16, 0),
    endAt: isoAt(16, 30),
  },
];

async function renderSummary() {
  render(await SummaryPage({ searchParams: Promise.resolve({}) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchSyncedEventsMock.mockResolvedValue(planEvents);
  fetchTimeEntriesMock.mockResolvedValue(timeEntries);
});

describe("サマリーの件数ステータス行(P5-3 S3)", () => {
  it("S3: ヒーローのメタ行直下に件数ステータス行が表示され、集計結果と一致する", async () => {
    await renderSummary();

    const counts = screen.getByTestId("gap-hero-counts");
    expect(counts).toHaveTextContent(
      "予定2件・着手1・未着手1・割り込み1件(30分)",
    );
    expect(screen.getByTestId("gap-hero-meta").nextElementSibling).toBe(counts);
  });
});
