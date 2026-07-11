// オンボーディング画面のUI文言(日本語)。将来のi18nを見据えてここに集約する(CLAUDE.md)

export interface OnboardingStep {
  title: string;
  description: string;
}

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    title: "予定を立てる",
    description:
      "カレンダーの「+」から今日の予定を作成します。まずは1つでOKです。",
  },
  {
    title: "タイマーで記録する",
    description:
      "予定をタップしてタイマーを開始します。予定にない作業はフリータイマーで記録できます。",
  },
  {
    title: "ギャップを見る",
    description:
      "予定(左・薄い色)と実績(右・濃い色)の重なりでズレが見えます。サマリーで今日/今週の集計も確認できます。",
  },
] as const;

export const ONBOARDING_MESSAGES = {
  heading: "PlanDiffの使い方",
  stepLabel: (current: number, total: number) => `${current} / ${total}`,
  back: "戻る",
  next: "次へ",
  start: "はじめる",
  skip: "スキップ",
  errorSaveFailed: "保存に失敗しました。もう一度お試しください",
} as const;
