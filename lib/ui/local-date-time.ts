import { addHours, addMinutes, format, isValid, parse } from "date-fns";

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
