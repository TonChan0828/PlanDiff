import { CALENDAR_MESSAGES } from "@/lib/calendar/messages";

// タイマーUIの文言(日本語)。将来のi18nを見据えてここに集約する(CLAUDE.md)

export const TIMER_MESSAGES = {
  startError: "タイマーを開始できませんでした",
  stopError: "タイマーを停止できませんでした",
  stop: "停止",
  recording: "記録中",
  untitled: CALENDAR_MESSAGES.untitled,
  startLabel: (title: string) =>
    `${title || CALENDAR_MESSAGES.untitled}のタイマーを開始`,
  stopLabel: (title: string) =>
    `${title || CALENDAR_MESSAGES.untitled}のタイマーを停止`,
} as const;
