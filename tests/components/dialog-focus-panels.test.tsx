import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppEventPanel } from "@/components/app-event-panel";
import { EditEntryPanel } from "@/components/edit-entry-panel";
import { RecurringRulePanel } from "@/components/recurring-rule-panel";
import { useDialogFocus } from "@/lib/ui/use-dialog-focus";

// 仕様書: P16-ui S3〜S5。各ダイアログを実際に切り替えて共通フックを検証する。
const entry = {
  id: "entry",
  title: "設計",
  startAt: new Date(2026, 8, 30, 9).toISOString(),
  endAt: new Date(2026, 8, 30, 10).toISOString(),
};
const rule = {
  id: "rule",
  title: "設計",
  pattern: "daily" as const,
  weekdays: null,
  startTime: "09:00",
  endTime: "10:00",
  timezone: "Asia/Tokyo",
  startsOn: "2026-09-30",
  endsOn: null,
  origin: "manual" as const,
  lastLearnedAt: null,
};
function Panel({ kind, pending = false }: { kind: string; pending?: boolean }) {
  const common = {
    onSave: vi.fn(),
    onDelete: vi.fn(),
    onClose: vi.fn(),
    pending,
    error: null,
  };
  return (
    <>
      {kind === "予定" ? (
        <AppEventPanel mode="edit" initial={entry} {...common} />
      ) : kind === "実績" ? (
        <EditEntryPanel entry={entry} {...common} />
      ) : (
        <RecurringRulePanel initial={rule} {...common} />
      )}
      <button>ダイアログ外</button>
    </>
  );
}

describe("P16-ui 削除確認のフォーカス", () => {
  it.each(["予定", "実績", "定期予定"])(
    "S3: %sの削除確認へ切替後もフォーカスを循環する",
    async (kind) => {
      const user = userEvent.setup();
      render(<Panel kind={kind} />);
      const dialog = screen.getByRole("dialog");
      await user.click(screen.getByRole("button", { name: /^削除$/ }));
      await waitFor(() =>
        expect(dialog).toContainElement(document.activeElement as HTMLElement),
      );
      const first = within(dialog).getByRole("button", { name: "閉じる" });
      const buttons = within(dialog).getAllByRole("button");
      const last = buttons[buttons.length - 1]!;
      last.focus();
      await user.tab();
      expect(first).toHaveFocus();
      await user.tab({ shift: true });
      expect(last).toHaveFocus();
      await user.click(
        within(dialog).getByRole("button", { name: "キャンセル" }),
      );
      await waitFor(() =>
        expect(dialog).toContainElement(document.activeElement as HTMLElement),
      );
      within(dialog).getByRole("button", { name: "保存" }).focus();
      await user.tab();
      expect(first).toHaveFocus();
    },
  );

  it("S4: 保存中に全要素が無効になってもフォーカスを保持し、再有効化後に戻す", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Panel kind="実績" />);
    screen.getByRole("button", { name: "保存" }).focus();
    rerender(<Panel kind="実績" pending />);
    const dialog = screen.getByRole("dialog");
    await waitFor(() => expect(dialog).toHaveFocus());
    await user.tab();
    expect(dialog).toHaveFocus();
    rerender(<Panel kind="実績" />);
    await waitFor(() =>
      expect(
        within(dialog).getByRole("button", { name: "閉じる" }),
      ).toHaveFocus(),
    );
  });
});

function FocusHarness({ onClose }: { onClose: () => void }) {
  const ref = useDialogFocus(onClose);
  return (
    <section role="dialog" tabIndex={-1} ref={ref}>
      <button tabIndex={-1}>循環対象外</button>
      <button hidden>非表示</button>
      <button>最初</button>
      <button>最後</button>
    </section>
  );
}

it("S5: 循環対象外要素を飛ばし、Escapeと閉じた後のフォーカス復元を維持する", async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  const { rerender } = render(<button>開く</button>);
  screen.getByRole("button", { name: "開く" }).focus();
  rerender(
    <>
      <button>開く</button>
      <FocusHarness onClose={onClose} />
    </>,
  );
  expect(screen.getByRole("button", { name: "最初" })).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalledTimes(1);
  rerender(<button>開く</button>);
  expect(screen.getByRole("button", { name: "開く" })).toHaveFocus();
});
