// P13-1 の通知・設定UIの日本語文言。将来のi18nを見据えてここに集約する(CLAUDE.md)

export const NOTIFICATION_MESSAGES = {
  // 通知そのもの
  staleTimerTitle: "計測しっぱなしかもしれません",
  untitledEntry: "(タイトルなし)",
  /** 例: 「設計レビュー」を 8月24日 21:30 から 13時間20分 計測中です */
  staleTimerBody: (title: string, startedAt: string, elapsed: string) =>
    `「${title}」を ${startedAt} から ${elapsed} 計測中です`,
  /** ペイロードが壊れていたときのフォールバック(sw.js 側にも同じ文字列を持つ) */
  staleTimerFallbackBody: "計測しっぱなしの記録があります",

  // 設定画面
  sectionHeading: "通知",
  description:
    "12時間以上続いている計測を、翌朝にお知らせします。停止し忘れた記録に気づけます。",
  enableButton: "通知を有効にする",
  disableButton: "無効にする",
  enabledOnThisDevice: "この端末で有効",
  notEnabled: "この端末では無効",
  blocked:
    "ブラウザの設定で通知がブロックされています。サイトの設定から通知を許可してください",
  iosNeedsHomeScreen:
    "iPhone・iPadでは、ホーム画面に追加したPlanDiffからのみ通知を受け取れます。共有メニューの「ホーム画面に追加」を実行してから、もう一度お試しください",
  unsupported: "この環境では通知を利用できません",
  enableFailed: "通知の設定に失敗しました。時間をおいてもう一度お試しください",
  disableFailed: "通知の解除に失敗しました。時間をおいてもう一度お試しください",
} as const;
