// 分数を「3時間15分」形式の日本語表示に変換する(P3-2)。

import { format } from "date-fns";
import { jaMinimal as ja } from "@/lib/ui/ja-locale";
import type { ActualBreakdownRow, DailyGapPoint } from "@/lib/summary/chart";
import { SUMMARY_MESSAGES as S } from "@/lib/summary/messages";
import type { ResolvedSummaryRange } from "@/lib/summary/range";

export function formatDurationMinutes(totalMinutes: number): string {
  const minutes = Math.round(totalMinutes);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) {
    return `${remainder}分`;
  }
  if (remainder === 0) {
    return `${hours}時間`;
  }
  return `${hours}時間${remainder}分`;
}

/** ズレの合計時間を符号付きで表示する(例: "+1時間15分" / "-30分" / "0分") */
export function formatSignedDurationMinutes(totalMinutes: number): string {
  const sign = totalMinutes > 0 ? "+" : totalMinutes < 0 ? "-" : "";
  return `${sign}${formatDurationMinutes(Math.abs(totalMinutes))}`;
}

/** 分数を「H:MM」の時計形式にする(D-3。例: 245 → "4:05") */
export function formatClockMinutes(totalMinutes: number): string {
  const minutes = Math.round(Math.abs(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours}:${String(remainder).padStart(2, "0")}`;
}

/** ズレを符号付きの時計形式にする(D-3。例: "+0:55" / "-1:10" / "±0:00") */
export function formatSignedClockMinutes(totalMinutes: number): string {
  const sign = totalMinutes > 0 ? "+" : totalMinutes < 0 ? "-" : "±";
  return `${sign}${formatClockMinutes(totalMinutes)}`;
}

/** ズレ%を符号付きで表示する(例: "+50%" / "-50%" / "0%") */
export function formatSignedPercent(percent: number): string {
  const sign = percent > 0 ? "+" : "";
  return `${sign}${percent}%`;
}

function formatDelayWith(
  label: string,
  onTimeLabel: string,
  delayMinutes: number,
): string {
  if (delayMinutes === 0) {
    return onTimeLabel;
  }
  if (delayMinutes > 0) {
    return `${label} ${formatSignedDurationMinutes(delayMinutes)}${S.startDelayLate}`;
  }
  return `${label} ${formatDurationMinutes(Math.abs(delayMinutes))}${S.startDelayEarly}`;
}

/**
 * 予定単位の開始遅延を文言化する(P5-8)。
 * 正(遅れ): "着手 予定より +14分遅れ" / 負(早着手): "着手 予定より 3分早い" / 0: "着手 予定どおり"
 */
export function formatStartDelay(delayMinutes: number): string {
  return formatDelayWith(S.startDelayLabel, S.startDelayOnTime, delayMinutes);
}

/**
 * 集約行の平均開始遅延を文言化する(P5-9)。
 * 例: "着手 予定より平均 +8分遅れ" / "着手 予定より平均 3分早い" / "着手 平均で予定どおり"
 */
export function formatAverageStartDelay(delayMinutes: number): string {
  return formatDelayWith(
    S.averageStartDelayLabel,
    S.averageStartDelayOnTime,
    delayMinutes,
  );
}

/**
 * 期間ラベルを組み立てる(P5-9)。表記は calendar-view と揃える。
 * today: "2026年8月1日(土)" / week・custom: "2026年7月27日〜8月2日"
 * (年をまたぐときは末尾にも年を出す) / month: "2026年8月"
 */
export function formatRangeLabel(resolved: ResolvedSummaryRange): string {
  const { key, from, to } = resolved;
  if (key === "month") {
    return format(from, "yyyy年M月", { locale: ja });
  }
  if (key === "today" || resolved.dayCount === 1) {
    return format(from, "yyyy年M月d日(E)", { locale: ja });
  }
  const tail =
    from.getFullYear() === to.getFullYear() ? "M月d日" : "yyyy年M月d日";
  return `${format(from, "yyyy年M月d日", { locale: ja })}〜${format(to, tail, { locale: ja })}`;
}

// P7-1: 日別ズレグラフの文言。日付整形は曜日トークン(E)を含まないため
// ロケール引数を取らない(P6-3で最小化した jaMinimal に依存させない)

/** X軸の日ラベル(例: "8/3") */
export function formatChartDayLabel(date: Date): string {
  return format(date, "M/d");
}

/** 棒の <title>(例: "8月3日 +1時間20分(計画 2時間 / 実績 3時間20分)") */
export function formatDailyGapPointTitle(point: DailyGapPoint): string {
  const gap =
    point.gapMinutes === 0
      ? `±${formatDurationMinutes(0)}`
      : formatSignedDurationMinutes(point.gapMinutes);
  return (
    `${format(point.date, "M月d日")} ${gap}` +
    `(${S.planShort} ${formatDurationMinutes(point.planMinutes)}` +
    ` / ${S.actualShort} ${formatDurationMinutes(point.actualMinutes)})`
  );
}

/** ズレが最大の超過日・不足日を取り出す。該当なしは null */
function findExtremes(points: DailyGapPoint[]): {
  over: DailyGapPoint | null;
  under: DailyGapPoint | null;
} {
  let over: DailyGapPoint | null = null;
  let under: DailyGapPoint | null = null;
  for (const point of points) {
    if (point.gapMinutes > 0 && (!over || point.gapMinutes > over.gapMinutes)) {
      over = point;
    }
    if (
      point.gapMinutes < 0 &&
      (!under || point.gapMinutes < under.gapMinutes)
    ) {
      under = point;
    }
  }
  return { over, under };
}

/**
 * グラフ全体の要約 aria-label(P7-1)。
 * 366日ぶんのデータテーブルは作らず、この要約と可視の極値行で代替する。
 */
export function formatDailyGapChartLabel(
  points: DailyGapPoint[],
  rangeLabel: string,
): string {
  const head = `${S.dailyChartHeading}(${rangeLabel})。`;
  const { over, under } = findExtremes(points);
  if (!over && !under) {
    return `${head}${S.dailyChartNoGap}`;
  }
  const parts: string[] = [];
  if (over) {
    parts.push(
      `${S.dailyChartMaxOver} ${format(over.date, "M月d日")} ${formatSignedDurationMinutes(over.gapMinutes)}`,
    );
  }
  if (under) {
    parts.push(
      `${S.dailyChartMaxUnder} ${format(under.date, "M月d日")} ${formatSignedDurationMinutes(under.gapMinutes)}`,
    );
  }
  return `${head}${parts.join("、")}`;
}

/**
 * グラフ直下に出す極値行(P7-1。例: "最大超過 8/6 +1:20・最大不足 8/9 -2:10")。
 * 日数が多いと全日にラベルを振れないため、これが「値を直接読める」手段になる。
 * ズレのある日が1つもなければ null(行を描かない)。
 */
export function formatDailyGapExtremes(points: DailyGapPoint[]): string | null {
  const { over, under } = findExtremes(points);
  if (!over && !under) {
    return null;
  }
  const parts: string[] = [];
  if (over) {
    parts.push(
      `${S.dailyChartMaxOver} ${formatChartDayLabel(over.date)} ${formatSignedClockMinutes(over.gapMinutes)}`,
    );
  }
  if (under) {
    parts.push(
      `${S.dailyChartMaxUnder} ${formatChartDayLabel(under.date)} ${formatSignedClockMinutes(under.gapMinutes)}`,
    );
  }
  return parts.join(S.dailyChartExtremeSeparator);
}

// P7-2: 時間の内訳グラフの文言

/**
 * 内訳行の種別テキスト(P7-2)。色以外の手がかりとして常に表示する。
 * 例: "予定 15分・割り込み 30分" / "予定 4時間50分" / "割り込み 45分"
 */
export function formatBreakdownKinds(row: ActualBreakdownRow): string {
  const parts: string[] = [];
  if (row.plannedMinutes > 0) {
    parts.push(
      `${S.breakdownPlanned} ${formatDurationMinutes(row.plannedMinutes)}`,
    );
  }
  if (row.unplannedMinutes > 0) {
    parts.push(
      `${S.breakdownUnplanned} ${formatDurationMinutes(row.unplannedMinutes)}`,
    );
  }
  return parts.join(S.countsSeparator);
}

/** 丸め行のタイトル(P7-2。例: "その他(4件)") */
export function formatBreakdownOtherTitle(count: number): string {
  return `${S.breakdownOther}(${count}${S.countsUnit})`;
}

export interface SummaryCounts {
  planCount: number;
  startedCount: number;
  notStartedCount: number;
  interruptionCount: number;
  interruptionTotalMinutes: number;
}

/**
 * 件数ステータス行の文言を組み立てる(P5-3)。
 * 例: "予定5件・着手3・未着手2・割り込み2件(1時間20分)"
 * 予定0件のとき着手・未着手を省略、割り込み0件のとき「割り込みなし」。
 */
export function formatSummaryCounts(counts: SummaryCounts): string {
  const parts = [`${S.countsPlan}${counts.planCount}${S.countsUnit}`];
  if (counts.planCount > 0) {
    parts.push(
      `${S.countsStarted}${counts.startedCount}`,
      `${S.countsNotStarted}${counts.notStartedCount}`,
    );
  }
  parts.push(
    counts.interruptionCount === 0
      ? S.countsInterruptionNone
      : `${S.countsInterruption}${counts.interruptionCount}${S.countsUnit}(${formatDurationMinutes(counts.interruptionTotalMinutes)})`,
  );
  return parts.join(S.countsSeparator);
}
