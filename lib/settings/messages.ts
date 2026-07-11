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

  // P4-2: アカウント・ログアウト・データ全削除
  accountSectionHeading: "アカウント",
  emailLabel: "メールアドレス",
  signOutButton: "ログアウト",
  dangerSectionHeading: "危険な操作",
  deleteAccountDescription:
    "アカウントと、予定・実績などすべてのデータが完全に削除されます。この操作は取り消せません。",
  deleteAccountConfirmLabel: "確認のため「削除」と入力してください",
  deleteAccountConfirmPhrase: "削除",
  deleteAccountButton: "アカウントを削除",
  errorAccountDeleteFailed:
    "アカウントの削除に失敗しました。時間をおいてもう一度お試しください",

  // P4-1: オンボーディング再閲覧
  helpSectionHeading: "使い方",
  reviewOnboardingLink: "使い方をもう一度見る",
} as const;
