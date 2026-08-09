import type { ActualBreakdown, ActualBreakdownRow } from "@/lib/summary/chart";
import {
  formatBreakdownKinds,
  formatBreakdownOtherTitle,
  formatDurationMinutes,
} from "@/lib/summary/format";
import { SUMMARY_MESSAGES as S } from "@/lib/summary/messages";

// 時間の内訳(横棒グラフ)。仕様書: docs/specs/P7-2_サマリーの時間内訳グラフ.md
//
// Server Component のまま描く(チャートライブラリを入れず、クライアントJSも増やさない)。
// 行のレイアウトとテキストは HTML、棒だけ inline SVG にする。タイトルは可変長で truncate が要り、
// 値は右揃えのテキストで出す必要があるため、テキストをSVGに入れると375pxで破綻する。

/** 棒のviewBox。幅100 = maxMinutes、高さ6は見た目の太さ */
const BAR_W = 100;
const BAR_H = 6;

interface SummaryActualBreakdownProps {
  breakdown: ActualBreakdown;
}

function LegendChip({
  className,
  label,
}: {
  className: string;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span aria-hidden="true" className={`size-2 rounded-xs ${className}`} />
      {label}
    </span>
  );
}

function BreakdownRow({
  row,
  maxMinutes,
}: {
  row: ActualBreakdownRow;
  maxMinutes: number;
}) {
  // maxMinutes 基準で正規化する(合計基準だと上位行が細くなり、行同士の比較がしづらい)。
  // rows が空なら描画に到達しないので 0除算は起きないが、防御しておく
  const scale = maxMinutes > 0 ? BAR_W / maxMinutes : 0;
  const plannedWidth = row.plannedMinutes * scale;
  const unplannedWidth = row.unplannedMinutes * scale;

  return (
    <li
      data-testid="breakdown-row"
      className="border-line bg-surface flex flex-col gap-1 rounded-lg border px-4 py-3"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="truncate text-sm font-medium">
          {row.isOther ? formatBreakdownOtherTitle(row.count) : row.title}
        </p>
        <span className="shrink-0 font-mono text-sm tabular-nums">
          {formatDurationMinutes(row.actualMinutes)}
        </span>
      </div>

      {/* 値は隣接テキストが読み上げるので、棒は装飾として隠す(二重読み上げの回避) */}
      <svg
        viewBox={`0 0 ${BAR_W} ${BAR_H}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        className="h-2 w-full"
      >
        {row.plannedMinutes > 0 ? (
          <rect
            data-testid="breakdown-bar-planned"
            x={0}
            y={0}
            width={plannedWidth}
            height={BAR_H}
            className="fill-brand"
          />
        ) : null}
        {row.unplannedMinutes > 0 ? (
          <rect
            data-testid="breakdown-bar-unplanned"
            x={plannedWidth}
            y={0}
            width={unplannedWidth}
            height={BAR_H}
            className="fill-interrupt"
          />
        ) : null}
      </svg>

      {/* 色以外の手がかり: 内訳を必ずテキストでも出す */}
      <p className="text-ink-muted text-xs tabular-nums">
        {formatBreakdownKinds(row)}
      </p>
    </li>
  );
}

export function SummaryActualBreakdown({
  breakdown,
}: SummaryActualBreakdownProps) {
  const { rows, maxMinutes } = breakdown;

  return (
    <section
      aria-labelledby="actual-breakdown-heading"
      className="flex flex-col gap-2"
    >
      <h2
        id="actual-breakdown-heading"
        className="text-ink-muted text-sm font-semibold"
      >
        {S.breakdownHeading}
      </h2>

      {rows.length === 0 ? (
        <p className="text-ink-muted text-sm">{S.breakdownEmpty}</p>
      ) : (
        <>
          <p className="text-ink-muted flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <LegendChip className="bg-brand" label={S.breakdownLegendPlanned} />
            <LegendChip
              className="bg-interrupt"
              label={S.breakdownLegendUnplanned}
            />
          </p>
          <ul className="flex flex-col gap-2">
            {rows.map((row) => (
              <BreakdownRow
                key={row.isOther ? "__other__" : row.title}
                row={row}
                maxMinutes={maxMinutes}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
