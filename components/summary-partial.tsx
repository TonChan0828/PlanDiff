import { formatClockMinutes } from "@/lib/summary/format";
import { SUMMARY_MESSAGES as S } from "@/lib/summary/messages";

// サマリーのヒーローで、期間の途中であることを示す表示(G-90)。
// 色だけに頼らず、文言のバッジで確定値と区別する(アクセシビリティ)。

/** 「途中経過・現時点まで」のバッジ。ヒーローの見出し行に置く */
export function SummaryPartialBadge() {
  return (
    <span
      data-testid="gap-hero-partial-badge"
      className="border-line text-ink-muted inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium"
    >
      <span className="font-bold">{S.partialBadge}</span>
      <span aria-hidden="true">・</span>
      <span>{S.partialAsOf}</span>
    </span>
  );
}

interface SummaryPartialProgressProps {
  /** ここまでの集計に入っている予定の件数 */
  elapsedCount: number;
  /** 期間内の全予定の件数 */
  totalCount: number;
  /** まだ始まっていない予定の件数と計画時間(分) */
  upcomingCount: number;
  upcomingMinutes: number;
}

/** 進み具合(経過した予定 N件 / 全 M件)と、このあとの予定 */
export function SummaryPartialProgress({
  elapsedCount,
  totalCount,
  upcomingCount,
  upcomingMinutes,
}: SummaryPartialProgressProps) {
  if (totalCount === 0) {
    return null;
  }
  return (
    <>
      <p
        data-testid="gap-hero-progress"
        className="text-ink-muted text-center text-xs tabular-nums"
      >
        {S.partialProgress(elapsedCount, totalCount)}
      </p>
      {upcomingCount > 0 ? (
        <p
          data-testid="gap-hero-upcoming"
          className="text-ink-muted text-center text-xs tabular-nums"
        >
          {S.partialUpcoming(
            upcomingCount,
            formatClockMinutes(upcomingMinutes),
          )}
        </p>
      ) : null}
    </>
  );
}
