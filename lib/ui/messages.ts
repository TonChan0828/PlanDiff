// DateTimeStepper(P5-5 / P5-6)の文言(日本語)。将来のi18nを見据えてここに集約する(CLAUDE.md)

export type SegmentUnit = "年" | "月" | "日" | "時" | "分";

export const DATE_TIME_STEPPER_MESSAGES = {
  // 隠しネイティブ date 入力(カレンダーピッカー)用
  dateLabel: (label: string) => `${label}の日付`,
  // 各セグメントの aria-label
  yearLabel: (label: string) => `${label}の年`,
  monthLabel: (label: string) => `${label}の月`,
  dayLabel: (label: string) => `${label}の日`,
  hourLabel: (label: string) => `${label}の時`,
  minuteLabel: (label: string) => `${label}の分`,
  // 共有ステッパー(フォーカス中セグメントに作用)
  incrementLabel: (label: string, unit: SegmentUnit) =>
    `${label}の${unit}を1進める`,
  decrementLabel: (label: string, unit: SegmentUnit) =>
    `${label}の${unit}を1戻す`,
  // カレンダーボタン
  calendarButtonLabel: (label: string) => `${label}をカレンダーで選ぶ`,
} as const;
