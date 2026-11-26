import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RulePauseReview } from "@/components/rule-pause-review";
import type {
  RecurringRuleSummary,
  RulePauseSuggestion,
} from "@/lib/calendar/recurring-id";

// 仕様書: docs/specs/G-93_休止中の予定カードの区別.md D1〜D7
// 日付はルールのタイムゾーンで扱い、基準時刻は props の now で固定する(R-1)。

vi.mock("@/lib/calendar/actions", () => ({ setRulePauseAction: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

// 2026-10-18 12:00 JST
const NOW = "2026-10-18T03:00:00Z";

function rule(
  id: string,
  overrides: Partial<RecurringRuleSummary> = {},
): RecurringRuleSummary {
  return {
    id,
    title: "勉強",
    pattern: "daily",
    weekdays: null,
    startTime: "22:00",
    endTime: "22:30",
    startsOn: "2026-01-01",
    endsOn: null,
    timezone: "Asia/Tokyo",
    origin: "suggestion",
    lastLearnedAt: null,
    autoAdjustEnabled: true,
    pauses: [{ startsOn: "2026-10-01", endsOn: null }],
    ...overrides,
  };
}

function renderPaused(rules: RecurringRuleSummary[]) {
  render(<RulePauseReview suggestions={[]} rules={rules} now={NOW} />);
  fireEvent.click(screen.getByText(/休止中の予定/));
}

describe("休止中の予定カードの区別(G-93)", () => {
  it("D1/D7: 同じ名前の2件は、時刻と曜日の違いで別々に分かり、読み上げ名も異なる", () => {
    renderPaused([
      rule("r1"),
      rule("r2", {
        pattern: "weekly",
        weekdays: [1, 3],
        startTime: "07:00",
        endTime: "07:45",
      }),
    ]);

    const evening = screen.getByRole("article", {
      name: "勉強 毎日 22:00〜22:30",
    });
    const morning = screen.getByRole("article", {
      name: "勉強 毎週月・水曜 07:00〜07:45",
    });
    expect(within(evening).getByText("毎日 22:00〜22:30")).toBeInTheDocument();
    expect(
      within(morning).getByText("毎週月・水曜 07:00〜07:45"),
    ).toBeInTheDocument();
  });

  it("D2: 平日のルールは「毎週平日」と表示する", () => {
    renderPaused([
      rule("r1", { pattern: "weekdays", weekdays: [1, 2, 3, 4, 5] }),
    ]);

    expect(screen.getByText("毎週平日 22:00〜22:30")).toBeInTheDocument();
  });

  it("D3: 休止開始日を表示する。再開予約済みでも表示する", () => {
    renderPaused([
      rule("r1"),
      rule("r2", {
        title: "読書",
        pauses: [{ startsOn: "2026-10-05", endsOn: "2026-10-19" }],
      }),
    ]);

    expect(screen.getByText("休止開始: 2026/10/1")).toBeInTheDocument();
    expect(screen.getByText("休止開始: 2026/10/5")).toBeInTheDocument();
  });

  it("D4: 開始日が今日より後なら「休止開始予定」、今日なら「休止開始」", () => {
    renderPaused([
      rule("r1", { pauses: [{ startsOn: "2026-10-19", endsOn: null }] }),
      rule("r2", {
        title: "読書",
        pauses: [{ startsOn: "2026-10-18", endsOn: null }],
      }),
    ]);

    expect(screen.getByText("休止開始予定: 2026/10/19")).toBeInTheDocument();
    expect(screen.getByText("休止開始: 2026/10/18")).toBeInTheDocument();
  });

  it("D4(境界): 「今日」はルールのタイムゾーンで判定する", () => {
    // 2026-10-18T12:00Z は、UTC・日本では 10/18 だが、Pacific/Kiritimati(UTC+14)では 10/19 02:00。
    // ルールのタイムゾーンで判定すれば、開始 10/19 は「今日」であって「予定」ではない
    render(
      <RulePauseReview
        suggestions={[]}
        rules={[
          rule("r1", {
            timezone: "Pacific/Kiritimati",
            pauses: [{ startsOn: "2026-10-19", endsOn: null }],
          }),
        ]}
        now="2026-10-18T12:00:00Z"
      />,
    );
    fireEvent.click(screen.getByText(/休止中の予定/));

    expect(screen.getByText("休止開始: 2026/10/19")).toBeInTheDocument();
    expect(screen.queryByText(/休止開始予定/)).not.toBeInTheDocument();
  });

  it("D9: 同じ日に休止と再開予約をした空の期間(開始=終了)は、開始日の行を出さない", () => {
    // 終了日は含まないため、1日も休止しない期間。「翌日から再開予定」と「休止開始予定」が矛盾しないようにする
    renderPaused([
      rule("r1", {
        pauses: [{ startsOn: "2026-10-19", endsOn: "2026-10-19" }],
      }),
    ]);

    expect(screen.getByText("翌日から再開予定です")).toBeInTheDocument();
    expect(screen.queryByText(/休止開始/)).not.toBeInTheDocument();
  });

  it("D10: 今日を含む休止と、これから始まる休止があれば、今日を含む方の開始日を出す", () => {
    renderPaused([
      rule("r1", {
        pauses: [
          { startsOn: "2026-10-19", endsOn: null },
          { startsOn: "2026-10-10", endsOn: "2026-10-19" },
        ],
      }),
    ]);

    expect(screen.getByText("休止開始: 2026/10/10")).toBeInTheDocument();
    expect(screen.queryByText(/休止開始予定/)).not.toBeInTheDocument();
  });

  it("D5: 終了した過去の休止があっても、現在の休止の開始日を表示する", () => {
    renderPaused([
      rule("r1", {
        pauses: [
          { startsOn: "2026-08-01", endsOn: "2026-08-15" },
          { startsOn: "2026-10-10", endsOn: null },
        ],
      }),
    ]);

    expect(screen.getByText("休止開始: 2026/10/10")).toBeInTheDocument();
    expect(screen.queryByText(/2026\/8\/1/)).not.toBeInTheDocument();
  });
});

describe("記録が途絶えた予定のカード(G-93 D6)", () => {
  const suggestion: RulePauseSuggestion = {
    ruleId: "r1",
    title: "勉強",
    timezone: "Asia/Tokyo",
    missedCount: 14,
    lastRecordedAt: null,
  };

  it("D6: 繰り返し条件と時刻を表示する", () => {
    render(
      <RulePauseReview
        suggestions={[suggestion]}
        rules={[rule("r1", { pauses: [] })]}
        now={NOW}
      />,
    );
    fireEvent.click(screen.getByText(/記録が途絶えた予定/));

    expect(
      screen.getByRole("article", { name: "勉強 毎日 22:00〜22:30" }),
    ).toBeInTheDocument();
  });

  it("D6: 対応するルールがなければ、条件の行を出さずに表示する", () => {
    render(<RulePauseReview suggestions={[suggestion]} rules={[]} now={NOW} />);
    fireEvent.click(screen.getByText(/記録が途絶えた予定/));

    expect(screen.getByRole("article", { name: "勉強" })).toBeInTheDocument();
    expect(screen.queryByText(/〜/)).not.toBeInTheDocument();
  });
});
