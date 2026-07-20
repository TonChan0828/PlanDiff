"use client";

import { useState } from "react";
import { format } from "date-fns";
import { TIMER_MESSAGES as T } from "@/lib/timer/messages";
import { useDialogFocus } from "@/lib/ui/use-dialog-focus";
import { LOCAL_DATE_TIME_FORMAT } from "@/lib/ui/local-date-time";
import { DateTimeStepper } from "@/components/date-time-stepper";

// 実行中タイマーの開始時刻変更パネル(D-4)。フィールドは開始時刻のみ。
// DateTimeStepper(P5-5)は端末ローカルタイムゾーンで表示し、保存時にUTCのISOへ変換する。
// 未来時刻はクライアントでも弾く(サーバー側でも+60秒許容つきで再検証する)

interface EditStartPanelProps {
  /** 実行中エントリの開始時刻(UTCのISO文字列) */
  initialStartAt: string;
  onSave: (startAtIso: string) => void;
  onClose: () => void;
  pending: boolean;
  error: string | null;
}

export function EditStartPanel({
  initialStartAt,
  onSave,
  onClose,
  pending,
  error,
}: EditStartPanelProps) {
  const [startLocal, setStartLocal] = useState(() =>
    format(new Date(initialStartAt), LOCAL_DATE_TIME_FORMAT),
  );
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
    if (!startLocal) {
      setValidationError(T.editStartRequired);
      return;
    }
    const startDate = new Date(startLocal);
    if (startDate.getTime() > Date.now()) {
      setValidationError(T.editStartFuture);
      return;
    }
    setValidationError(null);
    onSave(startDate.toISOString());
  };

  const displayedError = validationError ?? error;

  return (
    <div
      className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center sm:px-4"
      onClick={handleClose}
    >
      <form
        ref={dialogRef as React.RefObject<HTMLFormElement>}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-label={T.editStartTitle}
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
        className="border-line bg-surface flex max-h-[90dvh] w-full max-w-sm flex-col gap-3 overflow-y-auto rounded-t-xl border p-5 shadow-xl sm:rounded-lg"
      >
        <h2 className="text-base font-semibold">{T.editStartTitle}</h2>
        <DateTimeStepper
          label={T.editStartField}
          value={startLocal}
          onChange={setStartLocal}
          disabled={pending}
        />
        {displayedError ? (
          <p role="alert" className="text-danger text-sm">
            {displayedError}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={pending}
            className="border-line inline-flex min-h-11 items-center justify-center rounded-lg border px-4 text-sm font-medium disabled:opacity-50"
          >
            {T.cancel}
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
    </div>
  );
}
