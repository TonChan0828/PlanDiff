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

// 仕様書: docs/specs/D-3_サマリーヒーローとLP.md S1〜S4(diffヒーロー)

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

// 計画: 10:00〜11:00の1時間
const planEvents = [
  {
    id: "row-1",
    googleEventId: "g-1",
    title: "API設計",
    startAt: isoAt(10, 0),
    endAt: isoAt(11, 0),
    source: "app" as const,
  },
];

function entry(endHour: number, endMinute: number) {
  return [
    {
      id: "e-1",
      title: "API設計",
      googleEventId: "g-1",
      startAt: isoAt(10, 0),
      endAt: isoAt(endHour, endMinute),
    },
  ];
}

async function renderSummary(range?: string) {
  render(
    await SummaryPage({
      searchParams: Promise.resolve(range ? { range } : {}),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchSyncedEventsMock.mockResolvedValue(planEvents);
});

describe("サマリーのdiffヒーロー(S1〜S4)", () => {
  it("S1: 実績が計画より少ないと負の符号付き特大値と計画/実績の行が表示される", async () => {
    fetchTimeEntriesMock.mockResolvedValue(entry(10, 5)); // 実績5分 → -0:55

    await renderSummary();

    expect(screen.getByText("今日のズレ")).toBeInTheDocument();
    expect(screen.getByTestId("gap-hero-value")).toHaveTextContent("-0:55");
    expect(screen.getByTestId("gap-hero-meta")).toHaveTextContent(
      "計画 1:00 / 実績 0:05",
    );
  });

  it("S2: 実績が計画を上回ると+表記・超過(柿)スタイル・ハッチ下線が付く", async () => {
    fetchTimeEntriesMock.mockResolvedValue(entry(11, 55)); // 実績115分 → +0:55

    await renderSummary();

    const value = screen.getByTestId("gap-hero-value");
    expect(value).toHaveTextContent("+0:55");
    expect(value.className).toContain("interrupt");
    expect(screen.getByTestId("gap-hero-underline")).toBeInTheDocument();
  });

  it("S3: ズレ0では±0:00でハッチ下線が付かない(境界値)", async () => {
    fetchTimeEntriesMock.mockResolvedValue(entry(11, 0)); // ぴったり

    await renderSummary();

    expect(screen.getByTestId("gap-hero-value")).toHaveTextContent("±0:00");
    expect(screen.queryByTestId("gap-hero-underline")).not.toBeInTheDocument();
  });

  it("S3: 計画0(%算出不能)では%が-になる", async () => {
    fetchSyncedEventsMock.mockResolvedValue([]);
    fetchTimeEntriesMock.mockResolvedValue([
      {
        id: "e-free",
        title: "割り込み",
        googleEventId: null,
        startAt: isoAt(10, 0),
        endAt: isoAt(10, 30),
      },
    ]);

    await renderSummary();

    expect(screen.getByTestId("gap-hero-meta")).toHaveTextContent("(-)");
  });

  it("S4: range=weekでは見出しが「今週のズレ」になる", async () => {
    fetchTimeEntriesMock.mockResolvedValue(entry(11, 0));

    await renderSummary("week");

    expect(screen.getByText("今週のズレ")).toBeInTheDocument();
  });
});

// 仕様書: docs/specs/P5-8_予定単位のズレと開始遅延.md S4・S7
describe("予定単位のズレ%・開始遅延(P5-8)", () => {
  it("P5-8 S4: 着手済みの予定にズレ%と開始遅延の文言が表示される", async () => {
    // 予定10:00〜11:00(60分)、実績10:14〜11:36(82分・14分遅れで着手)
    fetchTimeEntriesMock.mockResolvedValue([
      {
        id: "e-1",
        title: "API設計",
        googleEventId: "g-1",
        startAt: isoAt(10, 14),
        endAt: isoAt(11, 36),
      },
    ]);

    await renderSummary();

    const gap = screen.getByTestId("gap-item-gap");
    expect(gap).toHaveTextContent("+37%");
    expect(screen.getByTestId("gap-item-start-delay")).toHaveTextContent(
      "着手 予定より +14分遅れ",
    );
  });

  it("P5-8 S7: 未着手の予定では開始遅延もズレ%も表示されない", async () => {
    fetchTimeEntriesMock.mockResolvedValue([]);

    await renderSummary();

    expect(screen.getByText("未着手")).toBeInTheDocument();
    expect(
      screen.queryByTestId("gap-item-start-delay"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("gap-item-gap")).not.toBeInTheDocument();
  });
});
