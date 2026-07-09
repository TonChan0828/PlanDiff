// 設定画面のUI文言(日本語)。将来のi18nを見据えてここに集約する(CLAUDE.md)

export const SETTINGS_MESSAGES = {
  heading: "設定",
  backToCalendar: "カレンダーに戻る",
  googleSectionHeading: "Googleカレンダー連携",
  connected: "連携済み",
  notConnected: "未連携",
  connectButton: "連携する",
  disconnectButton: "連携を解除",
  connectedSuccess: "Googleカレンダーと連携しました",
  errorState: "連携に失敗しました(state不一致)。もう一度お試しください",
  errorAuth: "Google側で認可がキャンセルされました。もう一度お試しください",
  errorFailed: "Google連携に失敗しました。時間をおいてもう一度お試しください",
  errorNoRefreshToken:
    "オフラインアクセスの許可が必要です。もう一度連携をやり直し、アクセス許可画面ですべての権限を許可してください",
} as const;
