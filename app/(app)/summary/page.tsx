import type { Metadata } from "next";
import Link from "next/link";
import { SummaryActualBreakdown } from "@/components/summary-actual-breakdown";
import { SummaryDailyGapChart } from "@/components/summary-daily-gap-chart";
import { fetchSyncedEventsInRange } from "@/lib/calendar/events";
import { materializeRecurringInstances } from "@/lib/calendar/recurring";
import { toDateParam } from "@/lib/calendar/view-date";
import { RowLimitExceededError } from "@/lib/errors/row-limit";
import {
  computeGapSummary,
  groupInterruptionsByTitle,
  groupItemsByTitle,
} from "@/lib/summary/aggregate";
import {
  computeActualBreakdown,
  computeDailyGapSeries,
} from "@/lib/summary/chart";
import {
  formatAverageStartDelay,
  formatClockMinutes,
  formatDurationMinutes,
  formatRangeLabel,
  formatSignedClockMinutes,
  formatSignedDurationMinutes,
  formatSignedPercent,
  formatStartDelay,
  formatSummaryCounts,
} from "@/lib/summary/format";
import { SUMMARY_MESSAGES as S } from "@/lib/summary/messages";
import {
  buildSummaryPath,
  resolveSummaryRange,
  shiftAnchorDate,
  toSyncRange,
  type ResolvedSummaryRange,
  type SummaryRangeKey,
} from "@/lib/summary/range";
import { createClient } from "@/lib/supabase/server";
import { actualBlockInputs } from "@/lib/timer/blocks";
import {
  fetchRunningEntry,
  fetchTimeEntriesInRange,
} from "@/lib/timer/entries";

export const metadata: Metadata = {
  title: "サマリー | PlanDiff",
};

interface SummarySearchParams {
  range?: string | string[];
  date?: string | string[];
  from?: string | string[];
  to?: string | string[];
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const TABS: { key: SummaryRangeKey; label: string }[] = [
  { key: "today", label: S.todayTab },
  { key: "week", label: S.weekTab },
  { key: "month", label: S.monthTab },
  { key: "custom", label: S.customTab },
];

const HERO_HEADINGS: Record<SummaryRangeKey, string> = {
  today: S.gapHeroToday,
  week: S.gapHeroWeek,
  month: S.gapHeroMonth,
  custom: S.gapHeroCustom,
};

/** タブのリンク先。custom は現在の期間をそのまま引き継ぐ */
function tabHref(key: SummaryRangeKey, resolved: ResolvedSummaryRange): string {
  return buildSummaryPath(key, {
    anchorDate: resolved.anchorDate,
    from: resolved.from,
    to: resolved.to,
  });
}

// サマリーの任意期間表示(P5-9)。期間は URL(?range&date / ?range=custom&from&to)で保持する
export default async function SummaryPage({
  searchParams,
}: {
  searchParams: Promise<SummarySearchParams>;
}) {
  const params = await searchParams;
  const now = new Date();
  const resolved = resolveSummaryRange(
    {
      range: firstParam(params.range),
      date: firstParam(params.date),
      from: firstParam(params.from),
      to: firstParam(params.to),
    },
    now,
  );

  const rangeControls = (
    <div className="flex flex-col gap-3">
      <div
        role="group"
        aria-label={S.rangeGroupLabel}
        className="border-line flex w-fit max-w-full overflow-hidden rounded-lg border"
      >
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={tabHref(tab.key, resolved)}
            aria-pressed={resolved.key === tab.key}
            className={`inline-flex min-h-11 flex-1 items-center justify-center px-3 text-sm font-medium whitespace-nowrap transition-colors sm:px-4 ${
              resolved.key === tab.key
                ? "bg-brand text-brand-ink"
                : "hover:bg-ink/5"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {resolved.key === "custom" ? (
        <form
          method="get"
          action="/summary"
          className="flex flex-wrap items-end gap-2"
        >
          <input type="hidden" name="range" value="custom" />
          <label className="flex flex-col gap-1 text-xs font-medium">
            {S.customFrom}
            <input
              type="date"
              name="from"
              defaultValue={toDateParam(resolved.from)}
              className="border-line bg-surface min-h-11 rounded-lg border px-3 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">
            {S.customTo}
            <input
              type="date"
              name="to"
              defaultValue={toDateParam(resolved.to)}
              className="border-line bg-surface min-h-11 rounded-lg border px-3 text-sm"
            />
          </label>
          <button
            type="submit"
            className="bg-brand text-brand-ink min-h-11 rounded-lg px-4 text-sm font-medium"
          >
            {S.customSubmit}
          </button>
        </form>
      ) : (
        <div className="flex items-center gap-2">
          <Link
            href={buildSummaryPath(resolved.key, {
              anchorDate: shiftAnchorDate(
                resolved.key,
                resolved.anchorDate,
                "prev",
              ),
            })}
            aria-label={S.prevRange}
            className="border-line hover:bg-ink/5 inline-flex size-11 shrink-0 items-center justify-center rounded-lg border text-sm"
          >
            ←
          </Link>
          <span
            data-testid="summary-range-label"
            className="min-w-0 flex-1 text-center text-sm font-medium tabular-nums"
          >
            {formatRangeLabel(resolved)}
          </span>
          <Link
            href={buildSummaryPath(resolved.key, {
              anchorDate: shiftAnchorDate(
                resolved.key,
                resolved.anchorDate,
                "next",
              ),
            })}
            aria-label={S.nextRange}
            className="border-line hover:bg-ink/5 inline-flex size-11 shrink-0 items-center justify-center rounded-lg border text-sm"
          >
            →
          </Link>
        </div>
      )}
    </div>
  );

  // 集計できない期間は、期間タブ・前後移動を残したまま理由だけを表示する
  const rangeErrorMain = (message: string) => (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <h1 className="text-2xl font-bold tracking-tight">{S.heading}</h1>
      {rangeControls}
      <p
        role="alert"
        data-testid="summary-range-error"
        className="border-line bg-surface rounded-lg border p-4 text-sm"
      >
        {message}
      </p>
    </main>
  );

  if (resolved.error === "too-long") {
    return rangeErrorMain(S.rangeTooLong);
  }

  const supabase = await createClient();
  const syncRange = toSyncRange(resolved.range);

  let loaded: [
    Awaited<ReturnType<typeof fetchSyncedEventsInRange>>,
    Awaited<ReturnType<typeof fetchTimeEntriesInRange>>,
    Awaited<ReturnType<typeof fetchRunningEntry>>,
  ];
  try {
    // 繰り返し予定の実体化はfetchSyncedEventsInRangeの直前に完了させる必要があるため直列で実行する(P5-1)。
    // 選択期間ぶんも実体化する(P5-9)
    await materializeRecurringInstances(supabase, now, syncRange);
    loaded = await Promise.all([
      fetchSyncedEventsInRange(supabase, syncRange),
      fetchTimeEntriesInRange(supabase, syncRange),
      fetchRunningEntry(supabase),
    ]);
  } catch (error) {
    // 行数上限に達した場合は誤った集計値を出さず、理由を日本語で示す(P6-0)。
    // それ以外のエラーはエラー境界(app/error.tsx)に委ねる
    if (error instanceof RowLimitExceededError) {
      return rangeErrorMain(S.rangeTooManyRows);
    }
    throw error;
  }
  const [planEvents, timeEntries, runningEntry] = loaded;
  const actualInputs = actualBlockInputs(timeEntries, runningEntry, now);
  const summary = computeGapSummary(planEvents, actualInputs, resolved.range);

  // 日別のズレは2日以上の期間でのみ出す(単日だと棒1本になり、
  // diffヒーローと同じ数字の重複表示にしかならないため。P7-1)
  const showDailyChart = resolved.dayCount >= 2;
  const dailyPoints = showDailyChart
    ? computeDailyGapSeries(planEvents, actualInputs, resolved.range)
    : [];

  // 時間の内訳は期間の長さによらず出す(単日でも「今日の時間の使い道」として意味を持つ。P7-2)
  const breakdown = computeActualBreakdown(
    summary.items,
    summary.interruptions,
  );

  // 2日以上の期間は同タイトルで集約する(1予定1行だと数百行になるため。P5-9)
  const isGrouped = resolved.dayCount > 1;
  const groupedItems = isGrouped ? groupItemsByTitle(summary.items) : [];
  const groupedInterruptions = isGrouped
    ? groupInterruptionsByTitle(summary.interruptions)
    : [];

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <h1 className="text-2xl font-bold tracking-tight">{S.heading}</h1>

      <div className="grid gap-8 lg:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.2fr)] lg:items-start">
        <div className="flex flex-col gap-5 lg:sticky lg:top-8">
          {rangeControls}

          {/* diffヒーロー(D-3): ズレを主役に。正=柿・負=群青・ゼロ=墨、
          ズレありのときだけハッチ下線(オーバーレイと同じ紋章)を敷く */}
          <section className="border-line bg-surface flex flex-col items-center gap-1 rounded-lg border p-5">
            <p className="text-ink-muted self-start text-xs font-bold">
              {HERO_HEADINGS[resolved.key]}
            </p>
            <p
              data-testid="gap-hero-value"
              className={`font-mono text-5xl leading-tight font-semibold tracking-tight tabular-nums ${
                summary.gapMinutes > 0
                  ? "text-interrupt"
                  : summary.gapMinutes < 0
                    ? "text-brand"
                    : ""
              }`}
            >
              {formatSignedClockMinutes(summary.gapMinutes)}
            </p>
            {summary.gapMinutes !== 0 ? (
              <span
                data-testid="gap-hero-underline"
                aria-hidden="true"
                className="border-interrupt/70 h-2 w-32 border-x"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(135deg, var(--hatch) 0px, var(--hatch) 4px, transparent 4px, transparent 8px)",
                }}
              />
            ) : null}
            <p
              data-testid="gap-hero-meta"
              className="text-ink-muted mt-1 font-mono text-sm tabular-nums"
            >
              {S.planShort} {formatClockMinutes(summary.planTotalMinutes)} /{" "}
              {S.actualShort} {formatClockMinutes(summary.actualTotalMinutes)}(
              {summary.gapPercent === null
                ? S.gapPercentUnavailable
                : formatSignedPercent(summary.gapPercent)}
              )
            </p>
            <p
              data-testid="gap-hero-counts"
              className="text-ink-muted text-center text-xs tabular-nums"
            >
              {formatSummaryCounts(summary)}
            </p>
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-8">
          {showDailyChart ? (
            <SummaryDailyGapChart
              points={dailyPoints}
              rangeLabel={formatRangeLabel(resolved)}
            />
          ) : null}

          <SummaryActualBreakdown breakdown={breakdown} />

          <section className="flex flex-col gap-2">
            <h2 className="text-ink-muted text-sm font-semibold">
              {S.itemsHeading}
            </h2>
            {summary.items.length === 0 ? (
              <p className="text-ink-muted text-sm">{S.itemsEmpty}</p>
            ) : isGrouped ? (
              <ul className="flex flex-col gap-2">
                {groupedItems.map((item) => (
                  <li
                    key={item.title}
                    data-testid="gap-grouped-item"
                    className="border-line bg-surface flex items-center justify-between gap-3 rounded-lg border px-4 py-3"
                  >
                    <div className="flex min-w-0 flex-col">
                      <p className="truncate text-sm font-medium">
                        {item.title}
                        <span className="text-ink-muted ml-2 text-xs tabular-nums">
                          {item.count}
                          {S.countsUnit}
                        </span>
                      </p>
                      <p className="text-ink-muted text-xs">
                        {S.planTotal} {formatDurationMinutes(item.planMinutes)}{" "}
                        / {S.actualTotal}{" "}
                        {formatDurationMinutes(item.actualMinutes)}
                      </p>
                      {item.averageStartDelayMinutes !== null ? (
                        <p
                          data-testid="gap-grouped-start-delay"
                          className="text-ink-muted text-xs tabular-nums"
                        >
                          {formatAverageStartDelay(
                            item.averageStartDelayMinutes,
                          )}
                        </p>
                      ) : null}
                    </div>
                    {item.notStartedCount === item.count ? (
                      <span className="bg-ink/8 text-ink-muted shrink-0 rounded-full px-3 py-1 text-xs font-medium">
                        {S.notStarted}
                      </span>
                    ) : (
                      <span
                        data-testid="gap-item-gap"
                        className="shrink-0 text-right font-mono text-sm font-medium tabular-nums"
                      >
                        {formatSignedDurationMinutes(item.gapMinutes)}
                        {item.gapPercent !== null
                          ? ` (${formatSignedPercent(item.gapPercent)})`
                          : ""}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="flex flex-col gap-2">
                {summary.items.map((item) => (
                  <li
                    key={item.googleEventId}
                    className="border-line bg-surface flex items-center justify-between gap-3 rounded-lg border px-4 py-3"
                  >
                    <div className="flex min-w-0 flex-col">
                      <p className="truncate text-sm font-medium">
                        {item.title}
                      </p>
                      <p className="text-ink-muted text-xs">
                        {S.planTotal} {formatDurationMinutes(item.planMinutes)}{" "}
                        / {S.actualTotal}{" "}
                        {formatDurationMinutes(item.actualMinutes)}
                      </p>
                      {item.startDelayMinutes !== null ? (
                        <p
                          data-testid="gap-item-start-delay"
                          className="text-ink-muted text-xs tabular-nums"
                        >
                          {formatStartDelay(item.startDelayMinutes)}
                        </p>
                      ) : null}
                    </div>
                    {item.notStarted ? (
                      <span className="bg-ink/8 text-ink-muted shrink-0 rounded-full px-3 py-1 text-xs font-medium">
                        {S.notStarted}
                      </span>
                    ) : (
                      <span
                        data-testid="gap-item-gap"
                        className="shrink-0 text-right font-mono text-sm font-medium tabular-nums"
                      >
                        {formatSignedDurationMinutes(item.gapMinutes)}
                        {item.gapPercent !== null
                          ? ` (${formatSignedPercent(item.gapPercent)})`
                          : ""}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-ink-muted text-sm font-semibold">
              {S.interruptionsHeading}
            </h2>
            {summary.interruptions.length === 0 ? (
              <p className="text-ink-muted text-sm">{S.interruptionsEmpty}</p>
            ) : isGrouped ? (
              <ul className="flex flex-col gap-2">
                {groupedInterruptions.map((item) => (
                  <li
                    key={item.title}
                    data-testid="interruption-grouped-item"
                    className="border-line bg-surface flex items-center justify-between gap-3 rounded-lg border px-4 py-3"
                  >
                    <p className="truncate text-sm font-medium">
                      {item.title}
                      <span className="text-ink-muted ml-2 text-xs tabular-nums">
                        {item.count}
                        {S.countsUnit}
                      </span>
                    </p>
                    <span className="text-ink-muted shrink-0 font-mono text-sm tabular-nums">
                      {formatDurationMinutes(item.actualMinutes)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="flex flex-col gap-2">
                {summary.interruptions.map((item) => (
                  <li
                    key={item.id}
                    className="border-line bg-surface flex items-center justify-between gap-3 rounded-lg border px-4 py-3"
                  >
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <span className="text-ink-muted shrink-0 font-mono text-sm tabular-nums">
                      {formatDurationMinutes(item.actualMinutes)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
