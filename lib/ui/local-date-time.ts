import {
  addDays,
  addHours,
  addMinutes,
  addMonths,
  addYears,
  format,
  getDaysInMonth,
  isValid,
  parse,
} from "date-fns";

// ローカル日時文字列("yyyy-MM-dd'T'HH:mm")に対する桁跨ぎ計算(P5-5)。
// DateTimeStepper用。Date の直接演算はせず date-fns 経由で行う。

export const LOCAL_DATE_TIME_FORMAT = "yyyy-MM-dd'T'HH:mm";

export interface LocalDateTimeParts {
  date: string;
  hour: number;
  minute: number;
}

export function parseLocalDateTime(value: string): LocalDateTimeParts | null {
  if (!value) {
    return null;
  }
  const parsed = parse(value, LOCAL_DATE_TIME_FORMAT, new Date());
  if (!isValid(parsed)) {
    return null;
  }
  return {
    date: format(parsed, "yyyy-MM-dd"),
    hour: parsed.getHours(),
    minute: parsed.getMinutes(),
  };
}

export function formatLocalDateTime(parts: LocalDateTimeParts): string {
  const parsed = parse(parts.date, "yyyy-MM-dd", new Date());
  parsed.setHours(parts.hour, parts.minute, 0, 0);
  return format(parsed, LOCAL_DATE_TIME_FORMAT);
}

function toDate(value: string): Date | null {
  if (!value) {
    return null;
  }
  const parsed = parse(value, LOCAL_DATE_TIME_FORMAT, new Date());
  return isValid(parsed) ? parsed : null;
}

export function stepLocalMinute(value: string, delta: 1 | -1): string {
  const date = toDate(value);
  if (!date) {
    return value;
  }
  return format(addMinutes(date, delta), LOCAL_DATE_TIME_FORMAT);
}

export function stepLocalHour(value: string, delta: 1 | -1): string {
  const date = toDate(value);
  if (!date) {
    return value;
  }
  return format(addHours(date, delta), LOCAL_DATE_TIME_FORMAT);
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

export function setLocalHour(value: string, hour: number): string {
  const date = toDate(value);
  if (!date) {
    return value;
  }
  date.setHours(clamp(hour, 0, 23));
  return format(date, LOCAL_DATE_TIME_FORMAT);
}

export function setLocalMinute(value: string, minute: number): string {
  const date = toDate(value);
  if (!date) {
    return value;
  }
  date.setMinutes(clamp(minute, 0, 59));
  return format(date, LOCAL_DATE_TIME_FORMAT);
}

export function setLocalDate(value: string, date: string): string {
  if (!date) {
    return "";
  }
  const current = toDate(value);
  const hour = current?.getHours() ?? 0;
  const minute = current?.getMinutes() ?? 0;
  return formatLocalDateTime({ date, hour, minute });
}

// 5セグメント(年/月/日/時/分)の増減・直接設定(P5-6)。
// DateTimeStepper の統合セグメント入力から使う。桁跨ぎは date-fns に委譲する。

export type LocalSegment = "year" | "month" | "day" | "hour" | "minute";

// セグメントを ±1。桁跨ぎ連動(分59→時+1、日→月跨ぎ、月→年跨ぎ等)。yearは上位桁なし。
export function stepLocalSegment(
  value: string,
  segment: LocalSegment,
  delta: 1 | -1,
): string {
  const date = toDate(value);
  if (!date) {
    return value;
  }
  const stepped =
    segment === "year"
      ? addYears(date, delta)
      : segment === "month"
        ? addMonths(date, delta)
        : segment === "day"
          ? addDays(date, delta)
          : segment === "hour"
            ? addHours(date, delta)
            : addMinutes(date, delta);
  return format(stepped, LOCAL_DATE_TIME_FORMAT);
}

// セグメントへ数値を設定(直接入力の確定用)。桁は跨がずクランプする。
export function setLocalSegment(
  value: string,
  segment: LocalSegment,
  n: number,
): string {
  const date = toDate(value);
  if (!date) {
    return value;
  }
  switch (segment) {
    case "year":
      date.setFullYear(clamp(n, 1, 9999));
      break;
    case "month": {
      // 月を先に決め、日をその月の末日でクランプする(2月31→28/29)
      const month = clamp(n, 1, 12) - 1;
      const probe = new Date(date.getFullYear(), month, 1);
      const day = clamp(date.getDate(), 1, getDaysInMonth(probe));
      date.setMonth(month, day);
      break;
    }
    case "day":
      date.setDate(clamp(n, 1, getDaysInMonth(date)));
      break;
    case "hour":
      date.setHours(clamp(n, 0, 23));
      break;
    case "minute":
      date.setMinutes(clamp(n, 0, 59));
      break;
  }
  return format(date, LOCAL_DATE_TIME_FORMAT);
}
