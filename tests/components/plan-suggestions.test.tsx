import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TZDate } from "@date-fns/tz";

import { PlanSuggestions } from "@/components/plan-suggestions";
import { CALENDAR_MESSAGES as M } from "@/lib/calendar/messages";
import type { TimeEntryItem } from "@/lib/timer/types";

// 仕様書: docs/specs/P5-2_実績からの予定提案.md S14〜S19
// 提案カードの表示・受け入れ(この週/毎週)・却下・エラー表示

const routerMock = { refresh: vi.fn(), push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => routerMock }));

const createAppEventAction = vi.fn();
const createRecurringRuleAction = vi.fn();
vi.mock("@/app/(app)/calendar/event-actions", () => ({
  createAppEventAction: (...args: unknown[]) => createAppEventAction(...args),
  createRecurringRuleAction: (...args: unknown[]) =>
    createRecurringRuleAction(...args),
}));

const TZ = "Asia/Tokyo";
const VIEW_DATE = "2026-07-14"; // 火曜
const NOW = new Date("2026-07-13T15:00:00.000Z"); // 2026-07-14 00:00 JST

let entrySeq = 0;

/** JSTローカルの "YYYY-MM-DD HH:mm" と所要分から完了実績を作る */
function entry(
  title: string,
  localStart: string,
  durationMin: number,
): TimeEntryItem {
  const [datePart, timePart] = localStart.split(" ");
  const [year, month, day] = (datePart ?? "").split("-").map(Number);
  const [hour, minute] = (timePart ?? "").split(":").map(Number);
  const start = new TZDate(
    year ?? 0,
    (month ?? 1) - 1,
    day ?? 1,
    hour ?? 0,
    minute ?? 0,
    0,
    TZ,
  );
  const end = new Date(start.getTime() + durationMin * 60 * 1000);
  entrySeq += 1;
  return {
    id: `entry-${entrySeq}`,
    title,
    googleEventId: null,
    startAt: new Date(start.getTime()).toISOString(),
    endAt: end.toISOString(),
  };
}

/** 「朝会」火曜10:00・30分×2回(→ 提案: 火 10:00-10:30、2回)を表示する */
function renderWithMorningMeeting() {
  render(
    <PlanSuggestions
      entries={[
        entry("朝会", "2026-06-30 10:00", 30),
        entry("朝会", "2026-07-07 10:00", 30),
      ]}
      events={[]}
      recurringRules={[]}
      viewDate={VIEW_DATE}
      now={NOW}
      timeZone={TZ}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("提案カードの表示(S14)", () => {
  it("S14: カードにタイトルと「毎週◯曜 HH:MM頃・約N分(直近4週でK回)」が表示される", () => {
    renderWithMorningMeeting();

    expect(screen.getByText(M.suggestionHeading)).toBeInTheDocument();
    expect(screen.getByText("朝会")).toBeInTheDocument();
    expect(
      screen.getByText("毎週火曜 10:00頃・約30分(直近4週で2回)"),
    ).toBeInTheDocument();
  });
});

describe("この週に追加(S15)", () => {
  it("S15: createAppEventActionが正しいUTC ISOで呼ばれ、成功でカードが消える", async () => {
    const user = userEvent.setup();
    createAppEventAction.mockResolvedValue({ ok: true });
    renderWithMorningMeeting();

    await user.click(
      screen.getByRole("button", { name: M.suggestionAddThisWeek }),
    );

    // 2026-07-14 10:00-10:30 JST = 01:00-01:30 UTC
    expect(createAppEventAction).toHaveBeenCalledWith({
      title: "朝会",
      startAt: "2026-07-14T01:00:00.000Z",
      endAt: "2026-07-14T01:30:00.000Z",
    });
    await waitFor(() => {
      expect(screen.queryByText("朝会")).not.toBeInTheDocument();
    });
    expect(routerMock.refresh).toHaveBeenCalled();
  });
});

describe("毎週にする(S16)", () => {
  it("S16: createRecurringRuleActionがweekly・該当曜日・HH:mm・TZ・startsOn=提案日で呼ばれる", async () => {
    const user = userEvent.setup();
    createRecurringRuleAction.mockResolvedValue({ ok: true });
    renderWithMorningMeeting();

    await user.click(
      screen.getByRole("button", { name: M.suggestionMakeWeekly }),
    );

    expect(createRecurringRuleAction).toHaveBeenCalledWith({
      title: "朝会",
      pattern: "weekly",
      weekdays: [2],
      startTime: "10:00",
      endTime: "10:30",
      timezone: TZ,
      startsOn: "2026-07-14",
      endsOn: null,
    });
    await waitFor(() => {
      expect(screen.queryByText("朝会")).not.toBeInTheDocument();
    });
    expect(routerMock.refresh).toHaveBeenCalled();
  });
});

describe("却下(S17)", () => {
  it("S17: 「×」でActionを呼ばずにカードが消える", async () => {
    const user = userEvent.setup();
    renderWithMorningMeeting();

    await user.click(
      screen.getByRole("button", {
        name: M.suggestionDismissLabel("朝会"),
      }),
    );

    expect(screen.queryByText("朝会")).not.toBeInTheDocument();
    expect(createAppEventAction).not.toHaveBeenCalled();
    expect(createRecurringRuleAction).not.toHaveBeenCalled();
  });
});

describe("エラー表示(S18)", () => {
  it("S18: この週に追加が失敗するとカード内に日本語エラーが出てカードは残る", async () => {
    const user = userEvent.setup();
    createAppEventAction.mockResolvedValue({ ok: false });
    renderWithMorningMeeting();

    await user.click(
      screen.getByRole("button", { name: M.suggestionAddThisWeek }),
    );

    expect(await screen.findByText(M.suggestionAddError)).toBeInTheDocument();
    expect(screen.getByText("朝会")).toBeInTheDocument();
  });

  it("S18: 毎週にするが失敗するとカード内に日本語エラーが出てカードは残る", async () => {
    const user = userEvent.setup();
    createRecurringRuleAction.mockResolvedValue({ ok: false });
    renderWithMorningMeeting();

    await user.click(
      screen.getByRole("button", { name: M.suggestionMakeWeekly }),
    );

    expect(
      await screen.findByText(M.suggestionMakeWeeklyError),
    ).toBeInTheDocument();
    expect(screen.getByText("朝会")).toBeInTheDocument();
  });
});

describe("候補0件(S19)", () => {
  it("S19: 候補がなければセクション自体が描画されない", () => {
    render(
      <PlanSuggestions
        entries={[]}
        events={[]}
        recurringRules={[]}
        viewDate={VIEW_DATE}
        now={NOW}
        timeZone={TZ}
      />,
    );
    expect(screen.queryByText(M.suggestionHeading)).not.toBeInTheDocument();
  });
});

// P5-7 まとめ提案(S36〜S39)。表示週は来週 2026-07-20(月)〜(now=07-14で全日未来)。
const NEXT_WEEK = "2026-07-21";

/** 指定曜日それぞれに 09:00・30分×2回 の完了実績を作る(遡り窓 06-22〜07-20 内) */
function bundleEntries(weekdays: number[], time = "09:00"): TimeEntryItem[] {
  // 各曜日の遡り窓内の2日(6/22週と6/29週)
  const firstMonday = "2026-06-22";
  const items: TimeEntryItem[] = [];
  for (const weekday of weekdays) {
    for (const weekOffset of [0, 7]) {
      const base = new TZDate(2026, 5, 22, 0, 0, 0, TZ); // 6/22(月)
      const offset = ((weekday + 6) % 7) + weekOffset;
      const d = new TZDate(base.getTime(), TZ);
      d.setDate(d.getDate() + offset);
      const localDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      items.push(entry("集中", `${localDate} ${time}`, 30));
    }
  }
  void firstMonday;
  return items;
}

function renderBundle(entries: TimeEntryItem[]) {
  render(
    <PlanSuggestions
      entries={entries}
      events={[]}
      recurringRules={[]}
      viewDate={NEXT_WEEK}
      now={NOW}
      timeZone={TZ}
    />,
  );
}

describe("まとめカードの説明文(S36)", () => {
  it("S36: weekdays束ねは「毎週平日 …」で表示される", () => {
    renderBundle(bundleEntries([1, 2, 3, 4, 5]));
    expect(
      screen.getByText("毎週平日 09:00頃・約30分(直近4週で10回)"),
    ).toBeInTheDocument();
  });

  it("S36: daily束ねは「毎日 …」で表示される", () => {
    renderBundle(bundleEntries([0, 1, 2, 3, 4, 5, 6]));
    expect(
      screen.getByText("毎日 09:00頃・約30分(直近4週で14回)"),
    ).toBeInTheDocument();
  });

  it("S36: 複数曜日weeklyは「毎週◯・◯・◯曜 …」で表示される", () => {
    renderBundle(bundleEntries([1, 3, 5]));
    expect(
      screen.getByText("毎週月・水・金曜 09:00頃・約30分(直近4週で6回)"),
    ).toBeInTheDocument();
  });
});

describe("まとめカードのこの週に追加(S37)", () => {
  it("S37: dates各日ぶん createAppEventAction が呼ばれ全成功でカードが消える", async () => {
    const user = userEvent.setup();
    createAppEventAction.mockResolvedValue({ ok: true });
    renderBundle(bundleEntries([1, 3, 5]));

    await user.click(
      screen.getByRole("button", { name: M.suggestionAddThisWeek }),
    );

    // 09:00-09:30 JST = 00:00-00:30 UTC。月(07-20)・水(07-22)・金(07-24)
    expect(createAppEventAction).toHaveBeenCalledTimes(3);
    expect(createAppEventAction).toHaveBeenCalledWith({
      title: "集中",
      startAt: "2026-07-20T00:00:00.000Z",
      endAt: "2026-07-20T00:30:00.000Z",
    });
    expect(createAppEventAction).toHaveBeenCalledWith({
      title: "集中",
      startAt: "2026-07-22T00:00:00.000Z",
      endAt: "2026-07-22T00:30:00.000Z",
    });
    expect(createAppEventAction).toHaveBeenCalledWith({
      title: "集中",
      startAt: "2026-07-24T00:00:00.000Z",
      endAt: "2026-07-24T00:30:00.000Z",
    });
    await waitFor(() => {
      expect(screen.queryByText("集中")).not.toBeInTheDocument();
    });
  });
});

describe("まとめカードの部分失敗(S38)", () => {
  it("S38: 一部の日が失敗するとrefreshは呼ばれカードは残りエラー表示", async () => {
    const user = userEvent.setup();
    createAppEventAction
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true });
    renderBundle(bundleEntries([1, 3, 5]));

    await user.click(
      screen.getByRole("button", { name: M.suggestionAddThisWeek }),
    );

    expect(await screen.findByText(M.suggestionAddError)).toBeInTheDocument();
    expect(screen.getByText("集中")).toBeInTheDocument();
    expect(routerMock.refresh).toHaveBeenCalled();
  });
});

describe("まとめカードの毎週にする(S39)", () => {
  it("S39: weekdays束ねは pattern='weekdays'・weekdays=null で呼ばれる", async () => {
    const user = userEvent.setup();
    createRecurringRuleAction.mockResolvedValue({ ok: true });
    renderBundle(bundleEntries([1, 2, 3, 4, 5]));

    await user.click(
      screen.getByRole("button", { name: M.suggestionMakeWeekly }),
    );

    expect(createRecurringRuleAction).toHaveBeenCalledWith({
      title: "集中",
      pattern: "weekdays",
      weekdays: null,
      startTime: "09:00",
      endTime: "09:30",
      timezone: TZ,
      startsOn: "2026-07-20",
      endsOn: null,
    });
  });

  it("S39: daily束ねは pattern='daily'・weekdays=null で呼ばれる", async () => {
    const user = userEvent.setup();
    createRecurringRuleAction.mockResolvedValue({ ok: true });
    renderBundle(bundleEntries([0, 1, 2, 3, 4, 5, 6]));

    await user.click(
      screen.getByRole("button", { name: M.suggestionMakeWeekly }),
    );

    expect(createRecurringRuleAction).toHaveBeenCalledWith(
      expect.objectContaining({ pattern: "daily", weekdays: null }),
    );
  });

  it("S39: 複数曜日weeklyは pattern='weekly'・weekdays=[観測曜日] で呼ばれる", async () => {
    const user = userEvent.setup();
    createRecurringRuleAction.mockResolvedValue({ ok: true });
    renderBundle(bundleEntries([1, 3, 5]));

    await user.click(
      screen.getByRole("button", { name: M.suggestionMakeWeekly }),
    );

    expect(createRecurringRuleAction).toHaveBeenCalledWith(
      expect.objectContaining({ pattern: "weekly", weekdays: [1, 3, 5] }),
    );
  });
});
