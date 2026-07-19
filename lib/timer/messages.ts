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
  freePlaceholder: "作業内容(空欄可)",
  freeStart: "開始",
  freeStartLabel: "フリータイマーを開始",
  editLabel: (title: string) =>
    `${title || CALENDAR_MESSAGES.untitled}の実績を編集`,
  // 実績からの再計測(P5-4)。編集(editLabel)と区別できる文言にする
  restartLabel: (title: string) =>
    `${title || CALENDAR_MESSAGES.untitled}を再計測`,
  editTitle: "実績を編集",
  editTitleField: "タイトル",
  editStartField: "開始時刻",
  editEndField: "終了時刻",
  editRequiredDateTime: "開始・終了時刻を入力してください",
  editInvalidRange: "終了時刻は開始時刻以降にしてください",
  editDeleteConfirm: "この実績を削除しますか?",
  editDeleteConfirmYes: "削除する",
  save: "保存",
  delete: "削除",
  cancel: "キャンセル",
  close: "閉じる",
  updateError: "実績を更新できませんでした",
  deleteError: "実績を削除できませんでした",
  // ズレは符号付きdiff形式で表す(D-1-2「時間のdiff」)
  delayLabel: (minutes: number) => `+${minutes}分 遅れ`,
  overrunLabel: (minutes: number) => `+${minutes}分 超過`,
  freeBadge: "フリー",
  // 実行中の開始時刻変更(D-4)。フィールド名は既存のeditStartField(開始時刻)を再利用する
  runningSinceLabel: (time: string) => `開始 ${time} を変更`,
  editStartTitle: "開始時刻を変更",
  editStartRequired: "開始時刻を入力してください",
  editStartFuture: "開始時刻は現在より後にできません",
  editStartError: "開始時刻を変更できませんでした",
} as const;
