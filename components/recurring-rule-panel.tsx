"use client";

import { useState } from "react";
import { CALENDAR_MESSAGES as M } from "@/lib/calendar/messages";
import type {
  RecurringPattern,
  RecurringRuleSummary,
} from "@/lib/calendar/recurring-id";

// 定期予定(P5-1)の「繰り返し全体」編集パネル。開始日(starts_on)は変更不可。
// 今日以降の実体化済みインスタンスは保存時に再生成される(過去分は残る。呼び出し元で担保)。

export interface RecurringRulePanelValues {
  title: string;
  pattern: RecurringPattern;
  weekdays: number[] | null;
  /** "HH:mm" 形式 */
  startTime: string;
  /** "HH:mm" 形式 */
  endTime: string;
  /** "YYYY-MM-DD" 形式。nullは無期限 */
  endsOn: string | null;
}

interface RecurringRulePanelProps {
  initial: RecurringRuleSummary;
  onSave: (values: RecurringRulePanelValues) => void;
  onDelete: () => void;
  onClose: () => void;
  pending: boolean;
  error: string | null;
}

export function RecurringRulePanel({
  initial,
  onSave,
  onDelete,
  onClose,
  pending,
  error,
}: RecurringRulePanelProps) {
  const [title, setTitle] = useState(initial.title);
  const [pattern, setPattern] = useState<RecurringPattern>(initial.pattern);
  const [weekdays, setWeekdays] = useState<number[]>(initial.weekdays ?? []);
  const [startTime, setStartTime] = useState(initial.startTime);
  const [endTime, setEndTime] = useState(initial.endTime);
  const [endsOnLocal, setEndsOnLocal] = useState(initial.endsOn ?? "");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const toggleWeekday = (day: number) => {
    setWeekdays((prev) =>
      prev.includes(day)
        ? prev.filter((value) => value !== day)
        : [...prev, day].sort((a, b) => a - b),
    );
  };

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
    if (!startTime || !endTime) {
      setValidationError(M.eventRequiredDateTime);
      return;
    }
    if (startTime >= endTime) {
      setValidationError(M.eventInvalidRange);
      return;
    }
    if (pattern === "weekly" && weekdays.length === 0) {
      setValidationError(M.recurrenceWeekdaysRequired);
      return;
    }
    if (endsOnLocal && endsOnLocal < initial.startsOn) {
      setValidationError(M.recurrenceEndDateInvalid);
      return;
    }
    setValidationError(null);
    onSave({
      title: title.trim(),
      pattern,
      weekdays: pattern === "weekly" ? weekdays : null,
      startTime,
      endTime,
      endsOn: endsOnLocal || null,
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
        aria-label={M.recurringEditChoiceSeries}
        onClick={(event) => event.stopPropagation()}
        className="border-line bg-surface w-full max-w-sm rounded-2xl border p-5 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">
            {M.recurringEditChoiceSeries}
          </h2>
          <button
            type="button"
            aria-label="閉じる"
            onClick={handleClose}
            disabled={pending}
            className="text-ink-muted hover:bg-ink/5 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-lg disabled:opacity-50"
          >
            ×
          </button>
        </div>

        {confirmingDelete ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm">{M.recurringDeleteConfirm}</p>
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
                キャンセル
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={pending}
                className="bg-danger inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-medium text-white disabled:opacity-50"
              >
                {M.recurringDeleteConfirmYes}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <p className="text-ink-muted text-sm">{M.recurringEditWarning}</p>
            <label className="flex flex-col gap-1 text-sm">
              <span>{M.eventTitleField}</span>
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                disabled={pending}
                maxLength={200}
                className="border-line bg-surface min-h-11 rounded-lg border px-3 text-sm disabled:opacity-50"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>{M.recurrenceField}</span>
              <select
                value={pattern}
                onChange={(event) =>
                  setPattern(event.target.value as RecurringPattern)
                }
                disabled={pending}
                className="border-line bg-surface min-h-11 rounded-lg border px-3 text-sm disabled:opacity-50"
              >
                <option value="daily">{M.recurrenceDaily}</option>
                <option value="weekly">{M.recurrenceWeekly}</option>
                <option value="weekdays">{M.recurrenceWeekdays}</option>
              </select>
            </label>
            {pattern === "weekly" ? (
              <div className="flex flex-col gap-1 text-sm">
                <span>{M.recurrenceWeekdaysField}</span>
                <div className="flex gap-1">
                  {M.weekdayLabels.map((label, day) => (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={weekdays.includes(day)}
                      aria-label={M.weekdayAriaLabel(label)}
                      onClick={() => toggleWeekday(day)}
                      disabled={pending}
                      className={`min-h-9 min-w-9 rounded-full border text-xs font-medium disabled:opacity-50 ${
                        weekdays.includes(day)
                          ? "bg-brand text-brand-ink border-brand"
                          : "border-line"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <label className="flex flex-col gap-1 text-sm">
              <span>{M.recurrenceStartTimeField}</span>
              <input
                type="time"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                disabled={pending}
                className="border-line bg-surface min-h-11 rounded-lg border px-3 text-sm disabled:opacity-50"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>{M.recurrenceEndTimeField}</span>
              <input
                type="time"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
                disabled={pending}
                className="border-line bg-surface min-h-11 rounded-lg border px-3 text-sm disabled:opacity-50"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>{M.recurrenceEndDateField}</span>
              <input
                type="date"
                value={endsOnLocal}
                onChange={(event) => setEndsOnLocal(event.target.value)}
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
                削除
              </button>
              <button
                type="submit"
                disabled={pending}
                className="bg-brand text-brand-ink hover:bg-brand/90 inline-flex min-h-11 items-center justify-center rounded-lg px-5 text-sm font-medium transition-colors disabled:opacity-50"
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
