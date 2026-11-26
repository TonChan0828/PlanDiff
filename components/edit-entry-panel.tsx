"use client";

import { useState } from "react";
import { format } from "date-fns";
import { X } from "lucide-react";
import { TIMER_MESSAGES as T } from "@/lib/timer/messages";
import { useDialogFocus } from "@/lib/ui/use-dialog-focus";
import { LOCAL_DATE_TIME_FORMAT } from "@/lib/ui/local-date-time";
import { DateTimeStepper } from "@/components/date-time-stepper";
import {
  PlanDiffSummary,
  type PlanDiffContext,
} from "@/components/plan-diff-summary";

// 実績の手動編集パネル(P2-4)。確定済み実績のタイトル・開始/終了時刻の修正、削除を行う。
// DateTimeStepper(P5-5)は端末ローカルタイムゾーンで表示し、保存時にUTCのISOへ変換する。

export interface EditEntryPanelEntry {
  id: string;
  title: string;
  /** 紐づく予定の id。フリー実績は null(G-98 のズレの欄の判定に使う) */
  googleEventId?: string | null;
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
  /** 紐づく予定がある場合だけ渡す。ズレの欄を表示する(G-98) */
  planContext?: PlanDiffContext;
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
  planContext,
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

  // 入力欄は分までしか持たないため、未編集のときは元の値(秒を含む)で計算し、サマリーの値と一致させる。
  // 時刻を変えたら、保存される値(分まで)で計算する
  const unchanged =
    startLocal === toLocalInputValue(entry.startAt) &&
    endLocal === toLocalInputValue(entry.endAt);
  const editedActual =
    planContext && startLocal && endLocal
      ? {
          id: entry.id,
          googleEventId: planContext.plan.googleEventId,
          startAt: unchanged ? entry.startAt : startLocal,
          endAt: unchanged ? entry.endAt : endLocal,
        }
      : null;

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
                className="border-line rounded-control inline-flex min-h-11 items-center justify-center border px-4 text-sm font-medium disabled:opacity-50"
              >
                {T.cancel}
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={pending}
                className="bg-danger rounded-control inline-flex min-h-11 items-center justify-center px-4 text-sm font-medium text-white disabled:opacity-50"
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
            {planContext ? (
              <PlanDiffSummary context={planContext} edited={editedActual} />
            ) : null}
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
                className="border-danger/40 text-danger rounded-control inline-flex min-h-11 items-center justify-center border px-4 text-sm font-medium disabled:opacity-50"
              >
                {T.delete}
              </button>
              <button
                type="submit"
                disabled={pending}
                className="bg-brand text-brand-ink hover:bg-brand/90 rounded-control inline-flex min-h-11 items-center justify-center px-5 text-sm font-medium transition-colors disabled:opacity-50"
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
