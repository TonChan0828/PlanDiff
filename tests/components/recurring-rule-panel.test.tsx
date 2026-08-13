import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  RecurringRulePanel,
  type RecurringRulePanelValues,
} from "@/components/recurring-rule-panel";
import { CALENDAR_MESSAGES as M } from "@/lib/calendar/messages";
import type { RecurringRuleSummary } from "@/lib/calendar/recurring-id";

// 仕様書: docs/specs/P10-1_提案経由予定の学習補正.md T20〜T22

const SUGGESTION_RULE: RecurringRuleSummary = {
  id: "rule-1",
  title: "朝会",
  pattern: "weekly",
  weekdays: [1, 2, 3, 4, 5],
  startTime: "09:00",
  endTime: "09:30",
  timezone: "Asia/Tokyo",
  startsOn: "2026-01-01",
  endsOn: null,
  origin: "suggestion",
  lastLearnedAt: null,
};

const MANUAL_RULE: RecurringRuleSummary = {
  ...SUGGESTION_RULE,
  origin: "manual",
};

function renderPanel(
  initial: RecurringRuleSummary,
  onDisableLearning?: () => Promise<{ ok: boolean }>,
) {
  const onSave = vi.fn<(values: RecurringRulePanelValues) => void>();
  const onDelete = vi.fn();
  const onClose = vi.fn();
  render(
    <RecurringRulePanel
      initial={initial}
      onSave={onSave}
      onDelete={onDelete}
      onClose={onClose}
      pending={false}
      error={null}
      onDisableLearning={onDisableLearning}
    />,
  );
  return { onSave, onDelete, onClose };
}

describe("学習停止トグル(T20)", () => {
  it("T20: origin='suggestion'の編集パネル When 描画 Then トグルが表示される", () => {
    renderPanel(SUGGESTION_RULE, vi.fn());

    expect(
      screen.getByRole("switch", { name: M.ruleLearningStopToggle }),
    ).toBeInTheDocument();
  });
});

describe("学習停止トグル(T21)", () => {
  it("T21: origin='manual'の編集パネル Then トグルは表示されない", () => {
    renderPanel(MANUAL_RULE, vi.fn());

    expect(
      screen.queryByRole("switch", { name: M.ruleLearningStopToggle }),
    ).not.toBeInTheDocument();
  });
});

describe("学習停止トグル(T22)", () => {
  it("T22: トグルをON When 成功 Then originを'manual'に更新するActionが呼ばれ、トグルの表示が消える", async () => {
    const user = userEvent.setup();
    const onDisableLearning = vi.fn().mockResolvedValue({ ok: true });
    renderPanel(SUGGESTION_RULE, onDisableLearning);

    await user.click(
      screen.getByRole("switch", { name: M.ruleLearningStopToggle }),
    );

    expect(onDisableLearning).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(
        screen.queryByRole("switch", { name: M.ruleLearningStopToggle }),
      ).not.toBeInTheDocument();
    });
  });

  it("T22: Actionが失敗を返す Then エラーが表示されトグルは残る", async () => {
    const user = userEvent.setup();
    const onDisableLearning = vi.fn().mockResolvedValue({ ok: false });
    renderPanel(SUGGESTION_RULE, onDisableLearning);

    await user.click(
      screen.getByRole("switch", { name: M.ruleLearningStopToggle }),
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        M.ruleLearningStopError,
      );
    });
    expect(
      screen.getByRole("switch", { name: M.ruleLearningStopToggle }),
    ).toBeInTheDocument();
  });
});
