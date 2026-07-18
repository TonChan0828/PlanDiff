// サマリー画面のUI文言(日本語)。将来のi18nを見据えてここに集約する(CLAUDE.md)

export const SUMMARY_MESSAGES = {
  heading: "サマリー",
  todayTab: "今日",
  weekTab: "今週",
  planTotal: "計画合計",
  actualTotal: "実績合計",
  gap: "ズレ",
  gapPercentUnavailable: "-",
  notStarted: "未着手",
  itemsHeading: "予定ごとの内訳",
  itemsEmpty: "この期間の予定はありません",
  interruptionsHeading: "割り込み・フリー作業",
  interruptionsEmpty: "割り込み・フリー作業はありません",
  summaryLink: "サマリー",
  backToCalendar: "カレンダーへ戻る",
  // D-3: diffヒーロー
  gapHeroToday: "今日のズレ",
  gapHeroWeek: "今週のズレ",
  planShort: "計画",
  actualShort: "実績",
  // P5-3: 件数ステータス行
  countsPlan: "予定",
  countsUnit: "件",
  countsStarted: "着手",
  countsNotStarted: "未着手",
  countsInterruption: "割り込み",
  countsInterruptionNone: "割り込みなし",
  countsSeparator: "・",
} as const;
