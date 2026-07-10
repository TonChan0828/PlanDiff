"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CALENDAR_MESSAGES as M } from "@/lib/calendar/messages";

// アプリ内予定の作成/編集パネル(P2-5)。edit-entry-panel(P2-4)のUIパターンを踏襲。
// datetime-local入力は端末ローカルタイムゾーンで表示し、保存時にUTCのISOへ変換する。
// 予定は開始 < 終了を厳密に要求する(ゼロ長は不可。実績編集の「以降」とは異なる)。

export interface AppEventPanelValues {
  title: string;
  /** UTCのISO文字列 */
  startAt: string;
  /** UTCのISO文字列 */
  endAt: string;
}

interface AppEventPanelProps {
  mode: "create" | "edit";
  initial: AppEventPanelValues;
  onSave: (values: AppEventPanelValues) => void;
  /** 編集モードのみ。削除ボタンを表示する */
  onDelete?: () => void;
  onClose: () => void;
  pending: boolean;
  error: string | null;
}

const DATETIME_LOCAL_FORMAT = "yyyy-MM-dd'T'HH:mm";

function toLocalInputValue(iso: string): string {
  return format(new Date(iso), DATETIME_LOCAL_FORMAT);
}

export function AppEventPanel({
  mode,
  initial,
  onSave,
  onDelete,
  onClose,
  pending,
  error,
}: AppEventPanelProps) {
  const [title, setTitle] = useState(initial.title);
  const [startLocal, setStartLocal] = useState(() =>
    toLocalInputValue(initial.startAt),
  );
  const [endLocal, setEndLocal] = useState(() =>
    toLocalInputValue(initial.endAt),
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const heading = mode === "create" ? M.eventCreateTitle : M.eventEditTitle;

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
    if (title.trim().length === 0) {
      setValidationError(M.eventTitleRequired);
      return;
    }
    if (!startLocal || !endLocal) {
      setValidationError(M.eventRequiredDateTime);
      return;
    }
    const startDate = new Date(startLocal);
    const endDate = new Date(endLocal);
    if (endDate.getTime() <= startDate.getTime()) {
      setValidationError(M.eventInvalidRange);
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
        aria-label={heading}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{heading}</h2>
          <button
            type="button"
            aria-label="閉じる"
            onClick={handleClose}
            disabled={pending}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-lg text-zinc-500 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            ×
          </button>
        </div>

        {confirmingDelete && onDelete ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              {M.eventDeleteConfirm}
            </p>
            {displayedError ? (
              <p
                role="alert"
                className="text-sm text-red-700 dark:text-red-400"
              >
                {displayedError}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                disabled={pending}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-zinc-300 px-4 text-sm font-medium disabled:opacity-50 dark:border-zinc-700"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={pending}
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-red-600 px-4 text-sm font-medium text-white disabled:opacity-50 dark:bg-red-500"
              >
                {M.eventDeleteConfirmYes}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span>{M.eventTitleField}</span>
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                disabled={pending}
                maxLength={200}
                className="min-h-11 rounded-lg border border-zinc-300 px-3 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>{M.eventStartField}</span>
              <input
                type="datetime-local"
                value={startLocal}
                onChange={(event) => setStartLocal(event.target.value)}
                disabled={pending}
                className="min-h-11 rounded-lg border border-zinc-300 px-3 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>{M.eventEndField}</span>
              <input
                type="datetime-local"
                value={endLocal}
                onChange={(event) => setEndLocal(event.target.value)}
                disabled={pending}
                className="min-h-11 rounded-lg border border-zinc-300 px-3 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            {displayedError ? (
              <p
                role="alert"
                className="text-sm text-red-700 dark:text-red-400"
              >
                {displayedError}
              </p>
            ) : null}
            <div
              className={`flex gap-2 ${mode === "edit" ? "justify-between" : "justify-end"}`}
            >
              {mode === "edit" && onDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  disabled={pending}
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-red-300 px-4 text-sm font-medium text-red-700 disabled:opacity-50 dark:border-red-800 dark:text-red-400"
                >
                  削除
                </button>
              ) : null}
              <button
                type="submit"
                disabled={pending}
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-zinc-900 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                保存
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
