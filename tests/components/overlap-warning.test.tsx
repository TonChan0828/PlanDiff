import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppEventPanel } from "@/components/app-event-panel";
import { RecurringRulePanel } from "@/components/recurring-rule-panel";
import type { RecurringRuleSummary } from "@/lib/calendar/recurring-id";

// 仕様書: docs/specs/G-94_予定の時間の重なりの警告.md H4〜H6
// 日時はローカルTZで組み立て、現在時刻を固定する(繰り返し全体の編集は今日以降が対象。R-1)

const iso = (day: number, hour: number, minute = 0) =>
  new Date(2026, 10, day, hour, minute).toISOString();

const event = (
  id: string,
  title: string,
  day: number,
  startHour: number,
  endHour: number,
  googleEventId = `app:${id}`,
) => ({
  id,
  googleEventId,
  title,
  startAt: iso(day, startHour),
  endAt: iso(day, endHour),
});

const WARNING = "ほかの予定と時間が重なっています(保存はできます)";

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 10, 24, 12, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

function renderEventPanel(
  events: ReturnType<typeof event>[],
  onSave = vi.fn(),
) {
  render(
    <AppEventPanel
      mode="create"
      initial={{ title: "副業", startAt: iso(24, 13), endAt: iso(24, 14) }}
      existingEvents={events}
      onSave={onSave}
      onClose={vi.fn()}
      pending={false}
      error={null}
    />,
  );
  return onSave;
}

// jsdom ではモバイル向けのネイティブ日時入力(P9-1)が描画される
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("予定の作成パネルの重なりの警告(G-94)", () => {
  it("H4: 重なる時間にすると対象が出て、重ならない時間にすると消える。警告中も保存できる", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onSave = renderEventPanel([event("e1", "英語学習", 24, 10, 11)]);
    expect(screen.queryByText(WARNING)).not.toBeInTheDocument();

    change("開始時刻", "2026-11-24T10:30");
    change("終了時刻", "2026-11-24T11:30");

    expect(screen.getByText(WARNING)).toBeInTheDocument();
    expect(
      screen.getByText("11/24(火) 10:00〜11:00 英語学習"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(onSave).toHaveBeenCalledTimes(1);

    change("開始時刻", "2026-11-24T11:00");
    expect(screen.queryByText(WARNING)).not.toBeInTheDocument();
  });

  it("H5: 4件以上は3件までと「ほか N件」を表示する", () => {
    renderEventPanel(
      [1, 2, 3, 4, 5].map((n) => event(`e${n}`, `予定${n}`, 24, 13, 14)),
    );

    const status = within(screen.getByRole("status"));
    expect(status.getAllByRole("listitem")).toHaveLength(3);
    expect(status.getByText("ほか 2件")).toBeInTheDocument();
  });

  it("H5(境界): 入力が未完成、または終了が開始以前なら警告を出さない", () => {
    renderEventPanel([event("e1", "英語学習", 24, 13, 14)]);
    expect(screen.getByText(WARNING)).toBeInTheDocument();

    for (const value of ["2026-11-24T13:00", ""]) {
      change("終了時刻", value);
      expect(screen.queryByText(WARNING)).not.toBeInTheDocument();
    }
  });

  it("定期予定の作成では、繰り返し条件に当たる日の予定とも判定する", () => {
    render(
      <AppEventPanel
        mode="create"
        initial={{ title: "副業", startAt: iso(24, 13), endAt: iso(24, 14) }}
        existingEvents={[event("e1", "英語学習", 26, 13, 14)]}
        onSave={vi.fn()}
        onSaveRecurring={vi.fn()}
        onClose={vi.fn()}
        pending={false}
        error={null}
      />,
    );
    // 単発では、別の日の予定とは重ならない
    expect(screen.queryByText(WARNING)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("繰り返し"), {
      target: { value: "daily" },
    });

    expect(
      screen.getByText("11/26(木) 13:00〜14:00 英語学習"),
    ).toBeInTheDocument();
  });
});

describe("繰り返し全体の編集の重なりの警告(G-94 H6)", () => {
  const rule: RecurringRuleSummary = {
    id: "rule-1",
    title: "勉強",
    pattern: "daily",
    weekdays: null,
    startTime: "10:00",
    endTime: "11:00",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    startsOn: "2026-11-01",
    endsOn: null,
    origin: "manual",
    lastLearnedAt: null,
    autoAdjustEnabled: false,
  };

  function renderRulePanel(events: ReturnType<typeof event>[]) {
    render(
      <RecurringRulePanel
        initial={rule}
        existingEvents={events}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        pending={false}
        error={null}
      />,
    );
  }

  it("自分の回では出ず、ほかの予定と重なると出る", () => {
    renderRulePanel([
      event("own", "勉強", 25, 10, 11, "rec:rule-1:2026-11-25"),
      event("e2", "英語学習", 25, 12, 13),
    ]);
    expect(screen.queryByText(WARNING)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("終了時刻"), {
      target: { value: "12:30" },
    });

    expect(
      screen.getByText("11/25(水) 12:00〜13:00 英語学習"),
    ).toBeInTheDocument();
  });

  it("保存で作り直すのは今日以降のため、過去の日の予定は警告しない", () => {
    renderRulePanel([event("past", "過去の予定", 23, 10, 11)]);

    expect(screen.queryByText(WARNING)).not.toBeInTheDocument();
  });
});
