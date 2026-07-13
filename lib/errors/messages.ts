// エラー境界・404画面(P4-5)のUI文言(日本語)。将来のi18nを見据えてここに集約する(CLAUDE.md)

export const ERROR_PAGE_MESSAGES = {
  notFound: {
    title: "ページが見つかりません",
    description:
      "お探しのページは移動したか、削除された可能性があります。URLをお確かめください。",
    backToTop: "トップへ戻る",
  },
  error: {
    title: "問題が発生しました",
    description:
      "一時的な問題の可能性があります。再試行しても解決しない場合は、時間をおいてお試しください。",
    retry: "再試行",
  },
  globalError: {
    title: "問題が発生しました",
    description:
      "画面の表示に失敗しました。再読み込みしても解決しない場合は、時間をおいてお試しください。",
    reload: "再読み込み",
  },
  loading: {
    label: "読み込み中",
  },
} as const;
