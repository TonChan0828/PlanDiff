import { CALENDAR_MESSAGES } from "@/lib/calendar/messages";

// 計測画面のUI文言(日本語)。将来のi18nを見据えてここに集約する(CLAUDE.md)

export const TRACK_MESSAGES = {
  heading: "計測",
  trackLink: "計測",
  calendarLink: "カレンダー",
  quickStartHeading: "今の予定から開始",
  todayHeading: "今日の実績",
  emptyToday: "今日の実績はまだありません",
  editHint: "実績の編集・削除はカレンダーから行えます",
  promote: "予定にする",
  promoteLabel: (title: string) =>
    `${title || CALENDAR_MESSAGES.untitled}を予定にする`,
  linkedBadge: "予定連動",
  freeBadge: "フリー",
  ongoingBadge: "進行中",
} as const;
