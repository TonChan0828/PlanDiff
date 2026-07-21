"use client";

import { useRef, useState } from "react";
import { getDaysInMonth } from "date-fns";
import { Calendar, ChevronDown, ChevronUp } from "lucide-react";
import {
  type LocalSegment,
  parseLocalDateTime,
  setLocalDate,
  setLocalSegment,
  stepLocalSegment,
} from "@/lib/ui/local-date-time";
import {
  DATE_TIME_STEPPER_MESSAGES as M,
  type SegmentUnit,
} from "@/lib/ui/messages";

// 日時セグメント入力(P5-6)。P5-5の3ブロック構成を、年/月/日 時:分の5セグメントを
// 1枠にまとめた統合フィールドへ置換。← →でセグメント移動、↑↓で増減(桁跨ぎ)、
// 数字で自動送り。共有▲▼はフォーカス中セグメントに作用し、カレンダーボタンで
// ネイティブ日付ピッカーを開く。value/onChangeは既存パネルと同じ
// "yyyy-MM-dd'T'HH:mm" ローカル文字列(未入力は "")で統一する。

export interface DateTimeStepperProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}

const SEGMENTS: LocalSegment[] = ["year", "month", "day", "hour", "minute"];

const SEGMENT_UNIT: Record<LocalSegment, SegmentUnit> = {
  year: "年",
  month: "月",
  day: "日",
  hour: "時",
  minute: "分",
};

const SEGMENT_WIDTH: Record<LocalSegment, number> = {
  year: 4,
  month: 2,
  day: 2,
  hour: 2,
  minute: 2,
};

function segmentLabel(label: string, segment: LocalSegment): string {
  switch (segment) {
    case "year":
      return M.yearLabel(label);
    case "month":
      return M.monthLabel(label);
    case "day":
      return M.dayLabel(label);
    case "hour":
      return M.hourLabel(label);
    case "minute":
      return M.minuteLabel(label);
  }
}

interface Parts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function toParts(value: string): Parts | null {
  const parsed = parseLocalDateTime(value);
  if (!parsed) {
    return null;
  }
  const [year, month, day] = parsed.date.split("-") as [string, string, string];
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: parsed.hour,
    minute: parsed.minute,
  };
}

function segmentValue(parts: Parts, segment: LocalSegment): number {
  return parts[segment];
}

function segmentMin(segment: LocalSegment): number {
  return segment === "hour" || segment === "minute" ? 0 : 1;
}

function segmentMax(parts: Parts | null, segment: LocalSegment): number {
  switch (segment) {
    case "year":
      return 9999;
    case "month":
      return 12;
    case "day":
      return parts
        ? getDaysInMonth(new Date(parts.year, parts.month - 1, 1))
        : 31;
    case "hour":
      return 23;
    case "minute":
      return 59;
  }
}

interface Buffer {
  segment: LocalSegment;
  text: string;
}

export function DateTimeStepper({
  label,
  value,
  onChange,
  disabled,
}: DateTimeStepperProps) {
  const parts = toParts(value);
  const datePart = value ? value.slice(0, 10) : "";

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const dateInputRef = useRef<HTMLInputElement | null>(null);

  const [activeSegment, setActiveSegment] = useState<LocalSegment>("minute");

  // 入力バッファ。stale-closure を避けるため ref と state を同期させる
  // (onBlur は ref を、描画は state を参照する)。
  const bufferRef = useRef<Buffer | null>(null);
  const [buffer, setBufferState] = useState<Buffer | null>(null);
  const setBuffer = (next: Buffer | null) => {
    bufferRef.current = next;
    setBufferState(next);
  };

  const timeDisabled = Boolean(disabled) || !value;

  const focusSegment = (index: number) => {
    if (index >= 0 && index < SEGMENTS.length) {
      inputRefs.current[index]?.focus();
    }
  };

  const commitBuffer = (segment: LocalSegment, text: string) => {
    if (text.length > 0) {
      onChange(setLocalSegment(value, segment, Number(text)));
    }
  };

  const handleDigit = (segment: LocalSegment, index: number, key: string) => {
    const base =
      bufferRef.current?.segment === segment ? bufferRef.current.text : "";
    const width = SEGMENT_WIDTH[segment];
    const combined = base + key;

    // もう1桁入れても範囲に収まらない(例: 分で6〜9、時で3〜9、月で2〜9)なら1桁で確定して送る
    const willAdvance =
      combined.length >= width ||
      Number(combined) * 10 > segmentMax(parts, segment);

    if (willAdvance) {
      setBuffer(null);
      onChange(setLocalSegment(value, segment, Number(combined)));
      focusSegment(index + 1);
    } else {
      setBuffer({ segment, text: combined });
    }
  };

  const handleKeyDown = (
    segment: LocalSegment,
    index: number,
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusSegment(index - 1);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusSegment(index + 1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      onChange(stepLocalSegment(value, segment, 1));
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      onChange(stepLocalSegment(value, segment, -1));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
      return;
    }
    if (event.key === "Backspace") {
      event.preventDefault();
      setBuffer(null);
      return;
    }
    if (/^[0-9]$/.test(event.key)) {
      event.preventDefault();
      handleDigit(segment, index, event.key);
    }
  };

  const stepActive = (delta: 1 | -1) => {
    if (!value) {
      return;
    }
    onChange(stepLocalSegment(value, activeSegment, delta));
  };

  const handlePickDate = (nextDate: string) => {
    onChange(setLocalDate(value, nextDate));
  };

  const openPicker = () => {
    const el = dateInputRef.current;
    if (!el) {
      return;
    }
    if (typeof el.showPicker === "function") {
      el.showPicker();
    } else {
      el.focus();
    }
  };

  const activeUnit = SEGMENT_UNIT[activeSegment];

  return (
    <fieldset disabled={disabled} className="flex flex-col gap-1 text-sm">
      <legend className="text-sm">{label}</legend>
      <div
        role="group"
        aria-label={label}
        className="border-line bg-surface flex min-h-11 flex-nowrap items-center gap-0.5 rounded-lg border px-2 py-1"
      >
        {SEGMENTS.map((segment, index) => {
          const width = SEGMENT_WIDTH[segment];
          const buffering =
            buffer?.segment === segment && buffer.text.length > 0;
          const display = buffering
            ? buffer.text.padStart(width, "0")
            : parts
              ? String(segmentValue(parts, segment)).padStart(width, "0")
              : "-".repeat(width);
          const now = parts ? segmentValue(parts, segment) : undefined;

          return (
            <div key={segment} className="flex items-center">
              {index > 0 ? (
                <span aria-hidden="true" className="text-ink-muted px-0.5">
                  {segment === "hour" ? "" : segment === "minute" ? ":" : "/"}
                </span>
              ) : null}
              <input
                ref={(el) => {
                  inputRefs.current[index] = el;
                }}
                type="text"
                inputMode="numeric"
                readOnly
                role="spinbutton"
                aria-label={segmentLabel(label, segment)}
                aria-valuemin={segmentMin(segment)}
                aria-valuemax={segmentMax(parts, segment)}
                aria-valuenow={now}
                value={display}
                disabled={timeDisabled}
                onFocus={() => {
                  setActiveSegment(segment);
                  setBuffer(null);
                }}
                onBlur={() => {
                  const b = bufferRef.current;
                  if (b && b.segment === segment) {
                    commitBuffer(segment, b.text);
                  }
                  setBuffer(null);
                }}
                onKeyDown={(event) => handleKeyDown(segment, index, event)}
                className={`focus:bg-brand/15 rounded bg-transparent text-center font-mono text-sm tabular-nums outline-none disabled:opacity-50 ${
                  width === 4 ? "w-11" : "w-7"
                }`}
              />
            </div>
          );
        })}

        <div className="ml-auto flex items-center gap-0.5">
          <div className="flex flex-col">
            <button
              type="button"
              aria-label={M.incrementLabel(label, activeUnit)}
              onClick={() => stepActive(1)}
              disabled={timeDisabled}
              className="text-ink-muted hover:bg-ink/5 inline-flex h-5 min-h-5 w-11 min-w-11 items-center justify-center rounded disabled:opacity-50"
            >
              <ChevronUp aria-hidden="true" className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label={M.decrementLabel(label, activeUnit)}
              onClick={() => stepActive(-1)}
              disabled={timeDisabled}
              className="text-ink-muted hover:bg-ink/5 inline-flex h-5 min-h-5 w-11 min-w-11 items-center justify-center rounded disabled:opacity-50"
            >
              <ChevronDown aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            aria-label={M.calendarButtonLabel(label)}
            onClick={openPicker}
            className="text-ink-muted hover:bg-ink/5 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full disabled:opacity-50"
          >
            <Calendar aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      </div>

      <input
        ref={dateInputRef}
        type="date"
        aria-label={M.dateLabel(label)}
        value={datePart}
        onChange={(event) => handlePickDate(event.target.value)}
        tabIndex={-1}
        className="sr-only"
      />
    </fieldset>
  );
}
