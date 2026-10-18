import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { RulePauseReview } from "@/components/rule-pause-review";
import { CALENDAR_MESSAGES as M } from "@/lib/calendar/messages";
import type {
  RecurringRuleSummary,
  RulePauseSuggestion,
} from "@/lib/calendar/recurring-id";

const { save, refresh } = vi.hoisted(() => ({
  save: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/app/(app)/calendar/event-actions", () => ({
  setRulePauseAction: save,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const NOW = "2026-10-18T03:00:00Z";
const suggestion: RulePauseSuggestion = {
  ruleId: "rule-1",
  title: "読書",
  timezone: "Asia/Tokyo",
  missedCount: 14,
  lastRecordedAt: "2026-10-01T01:00:00Z",
};
const rule: RecurringRuleSummary = {
  id: "rule-1",
  title: "読書",
  pattern: "daily",
  weekdays: null,
  startTime: "09:00",
  endTime: "09:30",
  startsOn: "2026-01-01",
  endsOn: null,
  timezone: "Asia/Tokyo",
  origin: "suggestion",
  lastLearnedAt: null,
  pauses: [{ startsOn: "2026-10-01", endsOn: null }],
};
beforeEach(() => {
  save.mockReset().mockResolvedValue({ ok: true });
  refresh.mockReset();
});

it("候補と休止中の予定がなければ表示しない", () => {
  const { container } = render(
    <RulePauseReview suggestions={[]} rules={[]} now={NOW} />,
  );
  expect(container).toBeEmptyDOMElement();
});
it("理由・最後の記録と休止の効果を表示し、成功後に更新する", async () => {
  render(<RulePauseReview suggestions={[suggestion]} rules={[]} now={NOW} />);
  fireEvent.click(screen.getByText(/記録が途絶えた予定/));
  expect(screen.getByText(M.pauseSuggestion(14))).toBeInTheDocument();
  expect(screen.getByText(/最後の記録：2026\/10\/1/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: M.pauseAction }));
  await waitFor(() => expect(save).toHaveBeenCalledWith("rule-1", "pause"));
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
});
it("再確認延期が成功した場合にだけ候補を隠す", async () => {
  render(<RulePauseReview suggestions={[suggestion]} rules={[]} now={NOW} />);
  fireEvent.click(screen.getByText(/記録が途絶えた予定/));
  fireEvent.click(screen.getByRole("button", { name: M.pauseSnoozeAction }));
  await waitFor(() => expect(save).toHaveBeenCalledWith("rule-1", "snooze"));
  await waitFor(() =>
    expect(screen.queryByRole("article")).not.toBeInTheDocument(),
  );
});
it.each(["returned", "thrown"])(
  "保存失敗時は候補を残し、再試行できる: %s",
  async (failure) => {
    if (failure === "thrown") save.mockRejectedValueOnce(new Error("network"));
    else save.mockResolvedValueOnce({ ok: false });
    render(<RulePauseReview suggestions={[suggestion]} rules={[]} now={NOW} />);
    fireEvent.click(screen.getByText(/記録が途絶えた予定/));
    fireEvent.click(screen.getByRole("button", { name: M.pauseAction }));
    expect(await screen.findByRole("alert")).toHaveTextContent(M.pauseError);
    expect(refresh).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: M.pauseRetry }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  },
);
it("保存中は二重操作を防ぐ", async () => {
  let resolve!: (value: { ok: boolean }) => void;
  save.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  render(<RulePauseReview suggestions={[suggestion]} rules={[]} now={NOW} />);
  fireEvent.click(screen.getByText(/記録が途絶えた予定/));
  const button = screen.getByRole("button", { name: M.pauseAction });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(save).toHaveBeenCalledOnce();
  expect(button).toBeDisabled();
  resolve({ ok: true });
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
});
it("休止中の予定を一覧から再開できる", async () => {
  render(<RulePauseReview suggestions={[]} rules={[rule]} now={NOW} />);
  fireEvent.click(screen.getByText(/休止中の予定/));
  const card = screen.getByRole("article", { name: "読書" });
  fireEvent.click(
    within(card).getByRole("button", { name: M.pauseResumeAction }),
  );
  await waitFor(() => expect(save).toHaveBeenCalledWith("rule-1", "resume"));
  expect(await screen.findByText(M.pauseResumeScheduled)).toBeInTheDocument();
});
it("再開予約済みの予定には再開ボタンを出さない", () => {
  render(
    <RulePauseReview
      suggestions={[]}
      rules={[
        { ...rule, pauses: [{ startsOn: "2026-10-01", endsOn: "2026-10-19" }] },
      ]}
      now={NOW}
    />,
  );
  expect(screen.getByText(M.pauseResumeScheduled)).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: M.pauseResumeAction }),
  ).not.toBeInTheDocument();
});
