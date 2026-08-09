import type { DailyGapPoint } from "@/lib/summary/chart";
import {
  formatChartDayLabel,
  formatDailyGapChartLabel,
  formatDailyGapExtremes,
  formatDailyGapPointTitle,
} from "@/lib/summary/format";
import { SUMMARY_MESSAGES as S } from "@/lib/summary/messages";

// 日別のズレ(発散棒グラフ)。仕様書: docs/specs/P7-1_サマリーの日別ズレグラフ.md
//
// Server Component のまま描く(チャートライブラリを入れず、クライアントJSも増やさない)。
// SVG内にテキストを置かず preserveAspectRatio="none" で横に自由伸縮させることで、
// 日数2〜366のどれでもコンテナ幅に収まり、DOMは rect 1つ/日で済む。
// 軸ラベル・凡例・極値行はSVGの外にHTMLで置く(文字が潰れない・将来のi18n可)。

const CHART_H = 100;
/** 0軸のY座標 */
const ZERO_Y = 50;
/** 上下それぞれの最大バー高(上下6ずつ余白) */
const HALF = 44;
/** 1日あたりの横幅(viewBox単位) */
const SLOT = 10;
/** 0でないズレが消えないための最小高 */
const MIN_BAR = 1.2;
/** これ以上の日数では棒間の隙間をなくし、密度のシルエットとして読ませる */
const GAPLESS_MIN_DAYS = 63;
/** これ以下なら全日ラベル、超えたら初日/中間/最終の3個に間引く */
const DENSE_MAX_DAYS = 7;

interface SummaryDailyGapChartProps {
  points: DailyGapPoint[];
  /** aria-label に埋める期間ラベル。page 側で formatRangeLabel(resolved) を渡す */
  rangeLabel: string;
}

/**
 * X軸ラベルに出す点を選ぶ。密モード(7日以下)は全日、
 * 疎モードは初日/中間/最終の3個だけにする(366日でも3ノードで済む)。
 */
function labelPoints(points: DailyGapPoint[]): DailyGapPoint[] {
  const dayCount = points.length;
  if (dayCount <= DENSE_MAX_DAYS) {
    return points;
  }
  return [0, Math.floor((dayCount - 1) / 2), dayCount - 1].flatMap((index) => {
    const point = points[index];
    return point ? [point] : [];
  });
}

export function SummaryDailyGapChart({
  points,
  rangeLabel,
}: SummaryDailyGapChartProps) {
  const dayCount = points.length;
  // 上下で同じ基準にすることで、+60分と-30分が高さ2:1になり比較が成立する
  const maxAbs = Math.max(1, ...points.map((p) => Math.abs(p.gapMinutes)));
  const barWidth = dayCount >= GAPLESS_MIN_DAYS ? SLOT : SLOT * 0.68;
  const barOffset = (SLOT - barWidth) / 2;
  const extremes = formatDailyGapExtremes(points);
  const isDense = dayCount <= DENSE_MAX_DAYS;
  const axisPoints = labelPoints(points);

  return (
    <section
      aria-labelledby="daily-gap-chart-heading"
      className="flex flex-col gap-2"
    >
      <h2
        id="daily-gap-chart-heading"
        className="text-ink-muted text-sm font-semibold"
      >
        {S.dailyChartHeading}
      </h2>

      <div className="border-line bg-surface flex flex-col gap-2 rounded-lg border p-4">
        <svg
          viewBox={`0 0 ${dayCount * SLOT} ${CHART_H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={formatDailyGapChartLabel(points, rangeLabel)}
          className="h-32 w-full sm:h-40"
        >
          {/* 0軸は「上=超過 / 下=不足」を読むための基準線なので、仕切り線用の --line ではなく
          両テーマで視認できる --ink-muted を薄く使う。
          横方向に潰れると線が消える/不均一に太るため non-scaling-stroke は必須 */}
          <line
            data-testid="daily-gap-zero-line"
            x1={0}
            y1={ZERO_Y}
            x2={dayCount * SLOT}
            y2={ZERO_Y}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            className="stroke-ink-muted opacity-40"
          />
          {points.map((point, index) => {
            const height =
              point.gapMinutes === 0
                ? MIN_BAR
                : Math.max(
                    MIN_BAR,
                    (Math.abs(point.gapMinutes) / maxAbs) * HALF,
                  );
            const sign = point.isEmpty
              ? "empty"
              : point.gapMinutes > 0
                ? "over"
                : point.gapMinutes < 0
                  ? "under"
                  : "zero";
            const fill =
              sign === "over"
                ? "fill-interrupt"
                : sign === "under"
                  ? "fill-brand"
                  : // ズレ0の日は0軸に埋もれないよう、基準線より濃くする
                    "fill-ink-muted opacity-80";
            return (
              <g key={point.date.toISOString()}>
                <title>{formatDailyGapPointTitle(point)}</title>
                <rect
                  data-testid="daily-gap-bar"
                  data-sign={sign}
                  data-date={formatChartDayLabel(point.date)}
                  x={index * SLOT + barOffset}
                  y={sign === "over" ? ZERO_Y - height : ZERO_Y}
                  width={barWidth}
                  // データなしの日は0軸だけを残し、棒を描かない
                  height={sign === "empty" ? 0 : height}
                  className={fill}
                />
              </g>
            );
          })}
        </svg>

        {isDense ? (
          <div
            className="text-ink-muted grid text-[10px] tabular-nums"
            style={{
              gridTemplateColumns: `repeat(${dayCount}, minmax(0, 1fr))`,
            }}
          >
            {points.map((point) => (
              <span
                key={point.date.toISOString()}
                data-testid="daily-gap-day-label"
                className="text-center"
              >
                {formatChartDayLabel(point.date)}
              </span>
            ))}
          </div>
        ) : (
          <div className="text-ink-muted flex justify-between text-[10px] tabular-nums">
            {axisPoints.map((point) => (
              <span
                key={point.date.toISOString()}
                data-testid="daily-gap-day-label"
              >
                {formatChartDayLabel(point.date)}
              </span>
            ))}
          </div>
        )}

        {/* 色以外の手がかり: 棒の向き(形)+ 凡例テキスト + 極値の数値 */}
        <p className="text-ink-muted flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-1">
            <span
              aria-hidden="true"
              className="bg-interrupt size-2 rounded-xs"
            />
            ↑ {S.dailyChartOver}
          </span>
          <span className="inline-flex items-center gap-1">
            <span aria-hidden="true" className="bg-brand size-2 rounded-xs" />↓{" "}
            {S.dailyChartUnder}
          </span>
        </p>

        {extremes ? (
          <p
            data-testid="daily-gap-extremes"
            className="text-ink-muted font-mono text-xs tabular-nums"
          >
            {extremes}
          </p>
        ) : null}
      </div>
    </section>
  );
}
