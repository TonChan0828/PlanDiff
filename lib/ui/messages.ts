// DateTimeStepper(P5-5)の文言(日本語)。将来のi18nを見据えてここに集約する(CLAUDE.md)

export const DATE_TIME_STEPPER_MESSAGES = {
  dateLabel: (label: string) => `${label}の日付`,
  hourLabel: (label: string) => `${label}の時`,
  minuteLabel: (label: string) => `${label}の分`,
  incrementLabel: (label: string, unit: "時" | "分") =>
    `${label}の${unit}を1進める`,
  decrementLabel: (label: string, unit: "時" | "分") =>
    `${label}の${unit}を1戻す`,
} as const;
