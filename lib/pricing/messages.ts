// 料金ページ(P4-4)のUI文言(日本語)。将来のi18nを見据えてここに集約する(CLAUDE.md)

export const PRICING_MESSAGES = {
  heading: "料金",
  subCopy: "ベータ期間中は、すべての機能を無料でご利用いただけます。",
  freeName: "Free",
  freeBadge: "現在提供中",
  freePrice: "¥0",
  freePriceNote: "ずっと無料",
  proName: "Pro",
  proBadge: "近日公開",
  proPriceNote: "価格は近日公開",
  proPlannedNote: "以下はすべて提供予定の機能です。",
  interestButton: "Proに興味あり",
  interestHint:
    "クリックはPro開発の後押しになります(送信されるのはクリックの事実だけです)",
  interestThanks: "興味を受け付けました。ありがとうございます!",
  interestError: "送信に失敗しました。時間をおいてもう一度お試しください",
  ctaTitle: "まずはFreeで、今日のズレから。",
  ctaSignup: "無料で始める",
} as const;

// Free: 現在提供中の機能のみを列挙する(未実装の制限・機能は書かない。仕様書P4-4c)
export const FREE_FEATURES = [
  "予定×実績のオーバーレイ表示",
  "ワンタップのタイマー記録(予定連動・フリー)",
  "今日・今週のギャップサマリー",
  "アプリ内での予定の作成・編集",
  "実績の手動修正",
] as const;

// Pro: 構想中の機能(要件定義書§10)。時期未定の開発ツール連携は載せない
export const PRO_FEATURES = [
  "履歴の無制限保存",
  "タスク種別ごとの見積もり傾向分析・サジェスト",
  "集中時間・会議コストの分析",
  "複数カレンダー",
  "エクスポート・API",
] as const;

// POST /api/pro-interest のエラー文言(P4-4b)
export const PRO_INTEREST_API_ERRORS = {
  invalidRequest: "不正なリクエストです",
  recordFailed: "記録に失敗しました",
} as const;
