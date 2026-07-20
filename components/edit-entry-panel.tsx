"use client";

import { useState } from "react";
import { format } from "date-fns";
import { X } from "lucide-react";
import { TIMER_MESSAGES as T } from "@/lib/timer/messages";
import { useDialogFocus } from "@/lib/ui/use-dialog-focus";
import { LOCAL_DATE_TIME_FORMAT } from "@/lib/ui/local-date-time";
import { DateTimeStepper } from "@/components/date-time-stepper";

// 実績の手動編集パネル(P2-4)。確定済み実績のタイトル・開始/終了時刻の修正、削除を行う。
// DateTimeStepper(P5-5)は端末ローカルタイムゾーンで表示し、保存時にUTCのISOへ変換する。

export interface EditEntryPanelEntry {
  id: string;
  title: string;
  /** UTCのISO文字列 */
  startAt: string;
  /** UTCのISO文字列 */
  endAt: string;
}

export interface EditEntrySaveInput {
  title: string;
  /** UTCのISO文字列 */
  startAt: string;
  /** UTCのISO文字列 */
  endAt: string;
}

interface EditEntryPanelProps {
  entry: EditEntryPanelEntry;
  onSave: (input: EditEntrySaveInput) => void;
  onDelete: () => void;
  onClose: () => void;
  pending: boolean;
  error: string | null;
}

function toLocalInputValue(iso: string): string {
  return format(new Date(iso), LOCAL_DATE_TIME_FORMAT);
}

export function EditEntryPanel({
  entry,
  onSave,
  onDelete,
  onClose,
  pending,
  error,
}: EditEntryPanelProps) {
  const [title, setTitle] = useState(entry.title);
  const [startLocal, setStartLocal] = useState(() =>
    toLocalInputValue(entry.startAt),
  );
  const [endLocal, setEndLocal] = useState(() =>
    toLocalInputValue(entry.endAt),
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleClose = () => {
    if (pending) {
      return;
    }
    onClose();
  };
  const dialogRef = useDialogFocus(handleClose);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) {
      return;
    }
    if (!startLocal || !endLocal) {
      setValidationError(T.editRequiredDateTime);
      return;
    }
    const startDate = new Date(startLocal);
    const endDate = new Date(endLocal);
    if (endDate.getTime() < startDate.getTime()) {
      setValidationError(T.editInvalidRange);
      return;
    }
    setValidationError(null);
    onSave({
      title: title.trim(),
      startAt: startDate.toISOString(),
      endAt: endDate.toISOString(),
    });
  };

  const displayedError = validationError ?? error;

  return (
    <div
      className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center sm:px-4"
      onClick={handleClose}
    >
      <div
        ref={dialogRef as React.RefObject<HTMLDivElement>}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-label={T.editTitle}
        onClick={(event) => event.stopPropagation()}
        className="border-line bg-surface max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-t-xl border p-5 shadow-xl sm:rounded-lg"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{T.editTitle}</h2>
          <button
            type="button"
            aria-label={T.close}
            onClick={handleClose}
            disabled={pending}
            className="text-ink-muted hover:bg-ink/5 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-lg disabled:opacity-50"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        {confirmingDelete ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm">{T.editDeleteConfirm}</p>
            {displayedError ? (
              <p role="alert" className="text-danger text-sm">
                {displayedError}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                disabled={pending}
                className="border-line inline-flex min-h-11 items-center justify-center rounded-lg border px-4 text-sm font-medium disabled:opacity-50"
              >
                {T.cancel}
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={pending}
                className="bg-danger inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-medium text-white disabled:opacity-50"
              >
                {T.editDeleteConfirmYes}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span>{T.editTitleField}</span>
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                disabled={pending}
                className="border-line bg-surface min-h-11 rounded-lg border px-3 text-sm disabled:opacity-50"
              />
            </label>
            <DateTimeStepper
              label={T.editStartField}
              value={startLocal}
              onChange={setStartLocal}
              disabled={pending}
            />
            <DateTimeStepper
              label={T.editEndField}
              value={endLocal}
              onChange={setEndLocal}
              disabled={pending}
            />
            {displayedError ? (
              <p role="alert" className="text-danger text-sm">
                {displayedError}
              </p>
            ) : null}
            <div className="flex justify-between gap-2">
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                disabled={pending}
                className="border-danger/40 text-danger inline-flex min-h-11 items-center justify-center rounded-lg border px-4 text-sm font-medium disabled:opacity-50"
              >
                {T.delete}
              </button>
              <button
                type="submit"
                disabled={pending}
                className="bg-brand text-brand-ink hover:bg-brand/90 inline-flex min-h-11 items-center justify-center rounded-lg px-5 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {T.save}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
