import type { Metadata } from "next";
import Link from "next/link";
import { addDays, addWeeks, startOfDay, startOfWeek } from "date-fns";
import { fetchSyncedEvents } from "@/lib/calendar/events";
import { materializeRecurringInstances } from "@/lib/calendar/recurring";
import { computeGapSummary, type SummaryRange } from "@/lib/summary/aggregate";
import {
  formatClockMinutes,
  formatDurationMinutes,
  formatSignedClockMinutes,
  formatSignedDurationMinutes,
  formatSignedPercent,
} from "@/lib/summary/format";
import { SUMMARY_MESSAGES as S } from "@/lib/summary/messages";
import { createClient } from "@/lib/supabase/server";
import { actualBlockInputs } from "@/lib/timer/blocks";
import { fetchRunningEntry, fetchTimeEntries } from "@/lib/timer/entries";

export const metadata: Metadata = {
  title: "サマリー | PlanDiff",
};

type RangeKey = "today" | "week";

function resolveRange(rangeParam: string | undefined, now: Date): SummaryRange {
  if (rangeParam === "week") {
    const start = startOfWeek(now, { weekStartsOn: 1 });
    return { start, end: addWeeks(start, 1) };
  }
  const start = startOfDay(now);
  return { start, end: addDays(start, 1) };
}

export default async function SummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string | string[] }>;
}) {
  const params = await searchParams;
  const rangeParamRaw = Array.isArray(params.range)
    ? params.range[0]
    : params.range;
  const activeRange: RangeKey = rangeParamRaw === "week" ? "week" : "today";

  const supabase = await createClient();
  const now = new Date();
  const range = resolveRange(activeRange, now);

  // 繰り返し予定の実体化はfetchSyncedEventsの直前に完了させる必要があるため直列で実行する(P5-1)
  await materializeRecurringInstances(supabase, now);
  const [planEvents, timeEntries, runningEntry] = await Promise.all([
    fetchSyncedEvents(supabase, now),
    fetchTimeEntries(supabase, now),
    fetchRunningEntry(supabase),
  ]);
  const actualInputs = actualBlockInputs(timeEntries, runningEntry, now);
  const summary = computeGapSummary(planEvents, actualInputs, range);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <h1 className="text-2xl font-bold tracking-tight">{S.heading}</h1>

      <div className="grid gap-8 lg:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.2fr)] lg:items-start">
        <div className="flex flex-col gap-5 lg:sticky lg:top-8">
          <div
            role="group"
            aria-label={S.heading}
            className="border-line flex w-fit overflow-hidden rounded-lg border"
          >
            <Link
              href="/summary?range=today"
              aria-pressed={activeRange === "today"}
              className={`inline-flex min-h-11 items-center justify-center px-4 text-sm font-medium transition-colors ${
                activeRange === "today"
                  ? "bg-brand text-brand-ink"
                  : "hover:bg-ink/5"
              }`}
            >
              {S.todayTab}
            </Link>
            <Link
              href="/summary?range=week"
              aria-pressed={activeRange === "week"}
              className={`inline-flex min-h-11 items-center justify-center px-4 text-sm font-medium transition-colors ${
                activeRange === "week"
                  ? "bg-brand text-brand-ink"
                  : "hover:bg-ink/5"
              }`}
            >
              {S.weekTab}
            </Link>
          </div>

          {/* diffヒーロー(D-3): ズレを主役に。正=柿・負=群青・ゼロ=墨、
          ズレありのときだけハッチ下線(オーバーレイと同じ紋章)を敷く */}
          <section className="border-line bg-surface flex flex-col items-center gap-1 rounded-lg border p-5">
            <p className="text-ink-muted self-start text-xs font-bold">
              {activeRange === "week" ? S.gapHeroWeek : S.gapHeroToday}
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
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-8">
          <section className="flex flex-col gap-2">
            <h2 className="text-ink-muted text-sm font-semibold">
              {S.itemsHeading}
            </h2>
            {summary.items.length === 0 ? (
              <p className="text-ink-muted text-sm">{S.itemsEmpty}</p>
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
                    </div>
                    {item.notStarted ? (
                      <span className="bg-ink/8 text-ink-muted shrink-0 rounded-full px-3 py-1 text-xs font-medium">
                        {S.notStarted}
                      </span>
                    ) : (
                      <span className="shrink-0 font-mono text-sm font-medium tabular-nums">
                        {formatSignedDurationMinutes(item.gapMinutes)}
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
