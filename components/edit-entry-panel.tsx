"use client";

import { useState } from "react";
import { format } from "date-fns";
import { TIMER_MESSAGES as T } from "@/lib/timer/messages";

// 実績の手動編集パネル(P2-4)。確定済み実績のタイトル・開始/終了時刻の修正、削除を行う。
// datetime-local入力は端末ローカルタイムゾーンで表示し、保存時にUTCのISOへ変換する。

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

const DATETIME_LOCAL_FORMAT = "yyyy-MM-dd'T'HH:mm";

function toLocalInputValue(iso: string): string {
  return format(new Date(iso), DATETIME_LOCAL_FORMAT);
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
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4"
      onClick={handleClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={T.editTitle}
        onClick={(event) => event.stopPropagation()}
        className="border-line bg-surface w-full max-w-sm rounded-2xl border p-5 shadow-xl"
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
            ×
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
            <label className="flex flex-col gap-1 text-sm">
              <span>{T.editStartField}</span>
              <input
                type="datetime-local"
                value={startLocal}
                onChange={(event) => setStartLocal(event.target.value)}
                disabled={pending}
                className="border-line bg-surface min-h-11 rounded-lg border px-3 text-sm disabled:opacity-50"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>{T.editEndField}</span>
              <input
                type="datetime-local"
                value={endLocal}
                onChange={(event) => setEndLocal(event.target.value)}
                disabled={pending}
                className="border-line bg-surface min-h-11 rounded-lg border px-3 text-sm disabled:opacity-50"
              />
            </label>
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
