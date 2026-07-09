// カレンダー画面のUI文言(日本語)。将来のi18nを見据えてここに集約する(CLAUDE.md)

export const CALENDAR_MESSAGES = {
  heading: "カレンダー",
  signOut: "ログアウト",
  loggedInSuffix: "さんとしてログイン中です。",
  refresh: "更新",
  syncing: "同期中…",
  syncError: "同期に失敗しました。時間をおいてもう一度お試しください",
  empty: "予定がありません",
  untitled: "(タイトルなし)",
  navPrev: "前へ",
  navNext: "次へ",
  navToday: "今日",
  viewDay: "日",
  viewWeek: "週",
  settingsLink: "設定",
  googleNotConnectedBanner:
    "Googleカレンダーが未接続です。接続すると予定と実績のギャップが見えるようになります。",
  googleReauthorizeBanner:
    "Googleカレンダーとの連携の有効期限が切れています。設定から再接続してください。",
  googleConnectSettingsLink: "設定でGoogleカレンダーを接続する",
} as const;
