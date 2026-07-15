"use client";

import { CALENDAR_MESSAGES as M } from "@/lib/calendar/messages";
import { useDialogFocus } from "@/lib/ui/use-dialog-focus";

// 定期予定(P5-1)の予定ブロック編集時に「この予定のみ」「繰り返し全体」を選ばせる中間パネル。
// app-event-panel.tsx(単発編集)/recurring-rule-panel.tsx(全体編集)へ分岐するための選択ステップ。

interface RecurringEditChoicePanelProps {
  onChooseOccurrence: () => void;
  onChooseSeries: () => void;
  onClose: () => void;
}

export function RecurringEditChoicePanel({
  onChooseOccurrence,
  onChooseSeries,
  onClose,
}: RecurringEditChoicePanelProps) {
  const dialogRef = useDialogFocus(onClose);
  return (
    <div
      className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center sm:px-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef as React.RefObject<HTMLDivElement>}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-label={M.recurringEditChoiceTitle}
        onClick={(event) => event.stopPropagation()}
        className="border-line bg-surface max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-t-xl border p-5 shadow-xl sm:rounded-lg"
      >
        <h2 className="mb-4 text-base font-semibold">
          {M.recurringEditChoiceTitle}
        </h2>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onChooseOccurrence}
            className="border-line hover:bg-ink/5 inline-flex min-h-11 items-center justify-center rounded-lg border px-4 text-sm font-medium"
          >
            {M.recurringEditChoiceOccurrence}
          </button>
          <button
            type="button"
            onClick={onChooseSeries}
            className="border-line hover:bg-ink/5 inline-flex min-h-11 items-center justify-center rounded-lg border px-4 text-sm font-medium"
          >
            {M.recurringEditChoiceSeries}
          </button>
        </div>
      </div>
    </div>
  );
}
