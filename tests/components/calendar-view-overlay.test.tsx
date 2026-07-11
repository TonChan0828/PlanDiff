import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { format, startOfDay } from "date-fns";

const {
  routerMock,
  startTimerActionMock,
  stopTimerActionMock,
  updateTimeEntryActionMock,
  deleteTimeEntryActionMock,
} = vi.hoisted(() => ({
  routerMock: { refresh: vi.fn(), push: vi.fn() },
  startTimerActionMock: vi.fn(),
  stopTimerActionMock: vi.fn(),
  updateTimeEntryActionMock: vi.fn(),
  deleteTimeEntryActionMock: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => routerMock }));
vi.mock("@/app/(app)/calendar/timer-actions", () => ({
  startTimerAction: startTimerActionMock,
  stopTimerAction: stopTimerActionMock,
  updateTimeEntryAction: updateTimeEntryActionMock,
  deleteTimeEntryAction: deleteTimeEntryActionMock,
}));

import { CalendarView } from "@/components/calendar-view";
import type { TimeEntryItem } from "@/lib/timer/types";

// 仕様書: docs/specs/P3-1_オーバーレイ表示.md S8〜S12

const today = startOfDay(new Date());
const todayParam = format(today, "yyyy-MM-dd");

function isoAt(hour: number, minute = 0): string {
  return new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
    hour,
    minute,
  ).toISOString();
}

const planEvents = [
  {
    id: "row-1",
    googleEventId: "g-1",
    title: "設計レビュー",
    startAt: isoAt(9, 0),
    endAt: isoAt(10, 0),
  },
];

function renderView(overrides: {
  timeEntries: TimeEntryItem[];
  viewParam?: string;
}) {
  return render(
    <CalendarView
      events={planEvents}
      timeEntries={overrides.timeEntries}
      runningEntry={null}
      viewParam={overrides.viewParam ?? "day"}
      dateParam={todayParam}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ events: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("開始遅延の表示(S8)", () => {
  it("S8: 紐づく実績が予定より遅く開始した場合、+N分 遅れの文言とストライプ装飾が表示される", async () => {
    renderView({
      timeEntries: [
        {
          id: "entry-1",
          title: "設計レビュー",
          googleEventId: "g-1",
          startAt: isoAt(9, 15),
          endAt: isoAt(10, 0),
        },
      ],
    });

    expect(await screen.findByText("+15分 遅れ")).toBeInTheDocument();
    expect(screen.getByTestId("gap-delay")).toBeInTheDocument();
  });
});

describe("超過の表示(S9)", () => {
  it("S9: 紐づく実績が予定より遅く終了した場合、+N分 超過の文言とストライプ装飾が表示される", async () => {
    renderView({
      timeEntries: [
        {
          id: "entry-1",
          title: "設計レビュー",
          googleEventId: "g-1",
          startAt: isoAt(9, 0),
          endAt: isoAt(10, 20),
        },
      ],
    });

    expect(await screen.findByText("+20分 超過")).toBeInTheDocument();
    expect(screen.getByTestId("gap-overrun")).toBeInTheDocument();
  });
});

describe("紐づかない実績の色分け(S10)", () => {
  it("S10: フリータイマーの実績は柿(interrupt)系の見た目になり、フリーラベルとaria-labelが付く", async () => {
    renderView({
      timeEntries: [
        {
          id: "entry-free",
          title: "読書",
          googleEventId: null,
          startAt: isoAt(20, 0),
          endAt: isoAt(20, 30),
        },
      ],
    });

    const block = await screen.findByRole("button", {
      name: /読書の実績を編集/,
    });
    expect(block.className).toContain("interrupt");
    expect(screen.getByText("フリー")).toBeInTheDocument();
    expect(
      screen.getByLabelText(/読書の実績を編集\(フリー\)/),
    ).toBeInTheDocument();
  });
});

describe("ズレなしの表示(S11)", () => {
  it("S11: 予定と実績がズレなく一致する場合、ズレ装飾は表示されない", async () => {
    renderView({
      timeEntries: [
        {
          id: "entry-1",
          title: "設計レビュー",
          googleEventId: "g-1",
          startAt: isoAt(9, 0),
          endAt: isoAt(10, 0),
        },
      ],
    });

    await screen.findByTestId("actual-block");
    expect(screen.queryByTestId("gap-delay")).not.toBeInTheDocument();
    expect(screen.queryByTestId("gap-overrun")).not.toBeInTheDocument();
    expect(screen.queryByText(/遅れ/)).not.toBeInTheDocument();
    expect(screen.queryByText(/超過/)).not.toBeInTheDocument();
  });
});

describe("週ビューでのズレ表示(S12)", () => {
  it("S12: 週ビューではテキストラベルは表示されないが、aria-labelにはズレ情報が含まれる", async () => {
    renderView({
      viewParam: "week",
      timeEntries: [
        {
          id: "entry-1",
          title: "設計レビュー",
          googleEventId: "g-1",
          startAt: isoAt(9, 15),
          endAt: isoAt(10, 0),
        },
      ],
    });

    await screen.findByTestId("actual-block");
    expect(screen.queryByText("+15分 遅れ")).not.toBeInTheDocument();
    expect(
      screen.getByLabelText(/設計レビューの実績を編集\(\+15分 遅れ\)/),
    ).toBeInTheDocument();
  });
});
