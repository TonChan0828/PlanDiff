"use client";

import { useState } from "react";
import { format } from "date-fns";
import { TIMER_MESSAGES as T } from "@/lib/timer/messages";

// 実行中タイマーの開始時刻変更パネル(D-4)。フィールドは開始時刻のみ。
// datetime-local入力は端末ローカルタイムゾーンで表示し、保存時にUTCのISOへ変換する。
// 未来時刻はクライアントでも弾く(サーバー側でも+60秒許容つきで再検証する)

interface EditStartPanelProps {
  /** 実行中エントリの開始時刻(UTCのISO文字列) */
  initialStartAt: string;
  onSave: (startAtIso: string) => void;
  onClose: () => void;
  pending: boolean;
  error: string | null;
}

const DATETIME_LOCAL_FORMAT = "yyyy-MM-dd'T'HH:mm";

export function EditStartPanel({
  initialStartAt,
  onSave,
  onClose,
  pending,
  error,
}: EditStartPanelProps) {
  const [startLocal, setStartLocal] = useState(() =>
    format(new Date(initialStartAt), DATETIME_LOCAL_FORMAT),
  );
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
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4"
      onClick={handleClose}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label={T.editStartTitle}
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
        className="border-line bg-surface flex w-full max-w-sm flex-col gap-3 rounded-2xl border p-5 shadow-xl"
      >
        <h2 className="text-base font-semibold">{T.editStartTitle}</h2>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-ink-muted text-xs font-semibold">
            {T.editStartField}
          </span>
          <input
            type="datetime-local"
            value={startLocal}
            onChange={(event) => setStartLocal(event.target.value)}
            disabled={pending}
            aria-label={T.editStartField}
            className="border-line bg-surface min-h-11 rounded-lg border px-3 font-mono text-sm tabular-nums disabled:opacity-50"
          />
        </label>
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
