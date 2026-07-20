"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  setLocalDate,
  setLocalHour,
  setLocalMinute,
  stepLocalHour,
  stepLocalMinute,
} from "@/lib/ui/local-date-time";
import { DATE_TIME_STEPPER_MESSAGES as M } from "@/lib/ui/messages";

// 日時ステッパー(P5-5)。datetime-localの代替。
// 分00→59の繰り下がりで時も-1、時00→23の繰り下がりで日付も-1する(桁跨ぎ)。
// value/onChangeは既存パネルと同じ "yyyy-MM-dd'T'HH:mm" ローカル文字列で統一する。

export interface DateTimeStepperProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function DateTimeStepper({
  label,
  value,
  onChange,
  disabled,
}: DateTimeStepperProps) {
  const datePart = value ? value.slice(0, 10) : "";
  const hourPart = value ? Number(value.slice(11, 13)) : null;
  const minutePart = value ? Number(value.slice(14, 16)) : null;

  // 日付が空になったとき、次に日付を入力した際に復元する直近の有効な時分。
  // レンダー中にvalueの変化を検知してstateを調整する(公式に許容されるパターン。
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
  const [prevValue, setPrevValue] = useState(value);
  const [lastTime, setLastTime] = useState<{ hour: number; minute: number }>(
    () => ({ hour: hourPart ?? 0, minute: minutePart ?? 0 }),
  );
  if (value !== prevValue) {
    setPrevValue(value);
    if (hourPart !== null && minutePart !== null) {
      setLastTime({ hour: hourPart, minute: minutePart });
    }
  }

  const [hourDraft, setHourDraft] = useState<string | null>(null);
  const [minuteDraft, setMinuteDraft] = useState<string | null>(null);

  const timeDisabled = Boolean(disabled) || !value;

  const handleDateChange = (nextDate: string) => {
    if (!nextDate) {
      onChange("");
      return;
    }
    if (!value) {
      onChange(`${nextDate}T${pad2(lastTime.hour)}:${pad2(lastTime.minute)}`);
      return;
    }
    onChange(setLocalDate(value, nextDate));
  };

  const commitHour = (raw: string) => {
    setHourDraft(null);
    if (!value || raw === "") {
      return;
    }
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) {
      return;
    }
    onChange(setLocalHour(value, parsed));
  };

  const commitMinute = (raw: string) => {
    setMinuteDraft(null);
    if (!value || raw === "") {
      return;
    }
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) {
      return;
    }
    onChange(setLocalMinute(value, parsed));
  };

  const stepHour = (delta: 1 | -1) => {
    if (!value) {
      return;
    }
    onChange(stepLocalHour(value, delta));
  };

  const stepMinute = (delta: 1 | -1) => {
    if (!value) {
      return;
    }
    onChange(stepLocalMinute(value, delta));
  };

  const hourDisplay = hourDraft ?? pad2(hourPart ?? lastTime.hour);
  const minuteDisplay = minuteDraft ?? pad2(minutePart ?? lastTime.minute);

  return (
    <fieldset disabled={disabled} className="flex flex-col gap-1 text-sm">
      <legend className="text-sm">{label}</legend>
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={datePart}
          onChange={(event) => handleDateChange(event.target.value)}
          aria-label={M.dateLabel(label)}
          disabled={disabled}
          className="border-line bg-surface min-h-11 rounded-lg border px-3 text-sm disabled:opacity-50"
        />
        <TimeUnitStepper
          label={label}
          unit="時"
          display={hourDisplay}
          ariaValueNow={hourPart ?? undefined}
          max={23}
          disabled={timeDisabled}
          onDraftChange={setHourDraft}
          onCommit={commitHour}
          onStep={stepHour}
        />
        <span aria-hidden="true" className="text-ink-muted">
          :
        </span>
        <TimeUnitStepper
          label={label}
          unit="分"
          display={minuteDisplay}
          ariaValueNow={minutePart ?? undefined}
          max={59}
          disabled={timeDisabled}
          onDraftChange={setMinuteDraft}
          onCommit={commitMinute}
          onStep={stepMinute}
        />
      </div>
    </fieldset>
  );
}

interface TimeUnitStepperProps {
  label: string;
  unit: "時" | "分";
  display: string;
  ariaValueNow: number | undefined;
  max: number;
  disabled: boolean;
  onDraftChange: (value: string) => void;
  onCommit: (raw: string) => void;
  onStep: (delta: 1 | -1) => void;
}

function TimeUnitStepper({
  label,
  unit,
  display,
  ariaValueNow,
  max,
  disabled,
  onDraftChange,
  onCommit,
  onStep,
}: TimeUnitStepperProps) {
  const ariaLabel = unit === "時" ? M.hourLabel(label) : M.minuteLabel(label);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      onStep(1);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      onStep(-1);
      return;
    }
    if (event.key === "Enter") {
      event.currentTarget.blur();
    }
  };

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        aria-label={M.incrementLabel(label, unit)}
        onClick={() => onStep(1)}
        disabled={disabled}
        className="text-ink-muted hover:bg-ink/5 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full disabled:opacity-50"
      >
        <ChevronUp aria-hidden="true" className="h-4 w-4" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        role="spinbutton"
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={ariaValueNow}
        value={display}
        disabled={disabled}
        onChange={(event) => onDraftChange(event.target.value)}
        onBlur={(event) => onCommit(event.target.value)}
        onKeyDown={handleKeyDown}
        className="border-line bg-surface min-h-11 w-12 rounded-lg border text-center font-mono text-sm tabular-nums disabled:opacity-50"
      />
      <button
        type="button"
        aria-label={M.decrementLabel(label, unit)}
        onClick={() => onStep(-1)}
        disabled={disabled}
        className="text-ink-muted hover:bg-ink/5 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full disabled:opacity-50"
      >
        <ChevronDown aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  );
}
