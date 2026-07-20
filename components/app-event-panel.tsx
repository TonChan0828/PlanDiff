"use client";

import { useState } from "react";
import { format } from "date-fns";
import { X } from "lucide-react";
import { CALENDAR_MESSAGES as M } from "@/lib/calendar/messages";
import type { RecurringPattern } from "@/lib/calendar/recurring-id";
import { useDialogFocus } from "@/lib/ui/use-dialog-focus";
import { LOCAL_DATE_TIME_FORMAT } from "@/lib/ui/local-date-time";
import { DateTimeStepper } from "@/components/date-time-stepper";

// アプリ内予定の作成/編集パネル(P2-5)。edit-entry-panel(P2-4)のUIパターンを踏襲。
// DateTimeStepper(P5-5)は端末ローカルタイムゾーンで表示し、保存時にUTCのISOへ変換する。
// 予定は開始 < 終了を厳密に要求する(ゼロ長は不可。実績編集の「以降」とは異なる)。
// 繰り返し予定(P5-1)の作成は本パネルのcreateモードに統合する(onSaveRecurringが
// 渡されたときのみ表示。editモードでは表示しない。単発の回の編集は既存のonSaveのまま)。

export interface AppEventPanelValues {
  title: string;
  /** UTCのISO文字列 */
  startAt: string;
  /** UTCのISO文字列 */
  endAt: string;
}

export interface RecurringSubmitValues {
  title: string;
  pattern: RecurringPattern;
  weekdays: number[] | null;
  /** "HH:mm" 形式。端末ローカルタイムゾーンにおける時刻 */
  startTime: string;
  /** "HH:mm" 形式。端末ローカルタイムゾーンにおける時刻 */
  endTime: string;
  timezone: string;
  /** "YYYY-MM-DD" 形式 */
  startsOn: string;
  /** "YYYY-MM-DD" 形式。nullは無期限 */
  endsOn: string | null;
}

interface AppEventPanelProps {
  mode: "create" | "edit";
  initial: AppEventPanelValues;
  onSave: (values: AppEventPanelValues) => void;
  /** createモードのみ。渡されると繰り返し予定の作成UIを表示する(P5-1) */
  onSaveRecurring?: (values: RecurringSubmitValues) => void;
  /** 編集モードのみ。削除ボタンを表示する */
  onDelete?: () => void;
  onClose: () => void;
  pending: boolean;
  error: string | null;
}

function toLocalInputValue(iso: string): string {
  return format(new Date(iso), LOCAL_DATE_TIME_FORMAT);
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function AppEventPanel({
  mode,
  initial,
  onSave,
  onSaveRecurring,
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

  // 繰り返し予定(P5-1)。createモード+onSaveRecurringが渡されたときのみ表示する
  const showRecurrence = mode === "create" && Boolean(onSaveRecurring);
  const [recurrence, setRecurrence] = useState<RecurringPattern | "">("");
  const [weekdays, setWeekdays] = useState<number[]>(() => [
    new Date(initial.startAt).getDay(),
  ]);
  const [endsOnLocal, setEndsOnLocal] = useState("");

  const toggleWeekday = (day: number) => {
    setWeekdays((prev) =>
      prev.includes(day)
        ? prev.filter((value) => value !== day)
        : [...prev, day].sort((a, b) => a - b),
    );
  };

  const heading = mode === "create" ? M.eventCreateTitle : M.eventEditTitle;

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

    if (showRecurrence && recurrence !== "") {
      if (recurrence === "weekly" && weekdays.length === 0) {
        setValidationError(M.recurrenceWeekdaysRequired);
        return;
      }
      if (!isSameLocalDay(startDate, endDate)) {
        setValidationError(M.recurrenceSameDayRequired);
        return;
      }
      const startsOn = format(startDate, "yyyy-MM-dd");
      if (endsOnLocal && endsOnLocal < startsOn) {
        setValidationError(M.recurrenceEndDateInvalid);
        return;
      }
      setValidationError(null);
      onSaveRecurring?.({
        title: title.trim(),
        pattern: recurrence,
        weekdays: recurrence === "weekly" ? weekdays : null,
        startTime: format(startDate, "HH:mm"),
        endTime: format(endDate, "HH:mm"),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        startsOn,
        endsOn: endsOnLocal || null,
      });
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
        aria-label={heading}
        onClick={(event) => event.stopPropagation()}
        className="border-line bg-surface max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-t-xl border p-5 shadow-xl sm:rounded-lg"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{heading}</h2>
          <button
            type="button"
            aria-label="閉じる"
            onClick={handleClose}
            disabled={pending}
            className="text-ink-muted hover:bg-ink/5 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-lg disabled:opacity-50"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        {confirmingDelete && onDelete ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm">{M.eventDeleteConfirm}</p>
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
                className="border-line bg-surface min-h-11 rounded-lg border px-3 text-sm disabled:opacity-50"
              />
            </label>
            <DateTimeStepper
              label={M.eventStartField}
              value={startLocal}
              onChange={setStartLocal}
              disabled={pending}
            />
            <DateTimeStepper
              label={M.eventEndField}
              value={endLocal}
              onChange={setEndLocal}
              disabled={pending}
            />
            {showRecurrence ? (
              <>
                <label className="flex flex-col gap-1 text-sm">
                  <span>{M.recurrenceField}</span>
                  <select
                    value={recurrence}
                    onChange={(event) =>
                      setRecurrence(event.target.value as RecurringPattern | "")
                    }
                    disabled={pending}
                    className="border-line bg-surface min-h-11 rounded-lg border px-3 text-sm disabled:opacity-50"
                  >
                    <option value="">{M.recurrenceNone}</option>
                    <option value="daily">{M.recurrenceDaily}</option>
                    <option value="weekly">{M.recurrenceWeekly}</option>
                    <option value="weekdays">{M.recurrenceWeekdays}</option>
                  </select>
                </label>
                {recurrence === "weekly" ? (
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
                          className={`min-h-11 min-w-11 rounded-full border text-xs font-medium disabled:opacity-50 ${
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
                {recurrence !== "" ? (
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
                ) : null}
              </>
            ) : null}
            {displayedError ? (
              <p role="alert" className="text-danger text-sm">
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
                  className="border-danger/40 text-danger inline-flex min-h-11 items-center justify-center rounded-lg border px-4 text-sm font-medium disabled:opacity-50"
                >
                  削除
                </button>
              ) : null}
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
