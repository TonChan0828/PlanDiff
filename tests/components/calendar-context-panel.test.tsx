import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { startOfDay } from "date-fns";
import { CalendarContextPanel } from "@/components/calendar-context-panel";

// 仕様書: docs/specs/P6-3_クライアントバンドルとレンダリング.md S13・S14

const selectedDate = startOfDay(new Date(2026, 7, 3));

function isoAt(day: Date, hour: number, minute = 0): string {
  const d = startOfDay(day);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function planEvent(id: string, title: string, hour: number) {
  return {
    id,
    googleEventId: `g-${id}`,
    title,
    startAt: isoAt(selectedDate, hour),
    endAt: isoAt(selectedDate, hour + 1),
  };
}

function renderPanel(
  events: ReturnType<typeof planEvent>[],
  timeEntries: {
    id: string;
    title: string;
    googleEventId: string | null;
    startAt: string;
    endAt: string;
  }[] = [],
) {
  return render(
    <CalendarContextPanel
      open
      tab="day"
      selectedDate={selectedDate}
      events={events}
      timeEntries={timeEntries}
      recurringRules={[]}
      suggestionEntries={[]}
      viewDate="2026-08-03"
      onEditEvent={() => {}}
      onEditEntry={() => {}}
      onRestartEntry={() => {}}
      onTabChange={() => {}}
      onClose={() => {}}
    />,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("選択日の絞り込みと並び(S13)", () => {
  it("S13: 選択日の予定だけが開始時刻の昇順で並ぶ", () => {
    const events = [
      planEvent("late", "夕会", 17),
      planEvent("early", "朝会", 9),
      {
        ...planEvent("other", "翌日の予定", 9),
        startAt: isoAt(new Date(2026, 7, 4), 9),
        endAt: isoAt(new Date(2026, 7, 4), 10),
      },
    ];

    renderPanel(events);

    const titles = screen
      .getAllByText(/朝会|夕会|翌日の予定/)
      .map((el) => el.textContent);
    expect(titles).toEqual(["朝会", "夕会"]);
  });

  it("S13: 選択日の実績だけが開始時刻の昇順で並ぶ", () => {
    const entries = [
      {
        id: "t2",
        title: "実績B",
        googleEventId: null,
        startAt: isoAt(selectedDate, 15),
        endAt: isoAt(selectedDate, 16),
      },
      {
        id: "t1",
        title: "実績A",
        googleEventId: null,
        startAt: isoAt(selectedDate, 10),
        endAt: isoAt(selectedDate, 11),
      },
      {
        id: "t3",
        title: "翌日の実績",
        googleEventId: null,
        startAt: isoAt(new Date(2026, 7, 4), 10),
        endAt: isoAt(new Date(2026, 7, 4), 11),
      },
    ];

    renderPanel([], entries);

    const titles = screen
      .getAllByText(/実績A|実績B|翌日の実績/)
      .map((el) => el.textContent);
    expect(titles).toEqual(["実績A", "実績B"]);
  });
});

describe("MediaQueryList のキャッシュ(S14)", () => {
  it("S14: 再レンダーしても window.matchMedia の呼び出しが増えない", () => {
    // jsdom は matchMedia を実装していないため、呼び出し回数を数えるスタブを入れる
    const calls: string[] = [];
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (query: string) => {
        calls.push(query);
        return {
          matches: false,
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        } as unknown as MediaQueryList;
      },
    });
    const spy = {
      mock: {
        get calls() {
          return calls;
        },
      },
    };

    const { rerender } = renderPanel([planEvent("a", "朝会", 9)]);
    const afterFirst = spy.mock.calls.length;

    rerender(
      <CalendarContextPanel
        open
        tab="day"
        selectedDate={selectedDate}
        events={[planEvent("a", "朝会", 9)]}
        timeEntries={[]}
        recurringRules={[]}
        suggestionEntries={[]}
        viewDate="2026-08-03"
        onEditEvent={() => {}}
        onEditEntry={() => {}}
        onRestartEntry={() => {}}
        onTabChange={() => {}}
        onClose={() => {}}
      />,
    );
    rerender(
      <CalendarContextPanel
        open
        tab="day"
        selectedDate={selectedDate}
        events={[planEvent("a", "朝会", 9)]}
        timeEntries={[]}
        recurringRules={[]}
        suggestionEntries={[]}
        viewDate="2026-08-03"
        onEditEvent={() => {}}
        onEditEntry={() => {}}
        onRestartEntry={() => {}}
        onTabChange={() => {}}
        onClose={() => {}}
      />,
    );

    // モジュールスコープにキャッシュしているため、再レンダーで増えない
    expect(spy.mock.calls.length).toBe(afterFirst);
  });
});
