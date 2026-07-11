import type { Metadata } from "next";
import Link from "next/link";
import { addDays, addWeeks, startOfDay, startOfWeek } from "date-fns";
import { fetchSyncedEvents } from "@/lib/calendar/events";
import { computeGapSummary, type SummaryRange } from "@/lib/summary/aggregate";
import {
  formatDurationMinutes,
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

  const [planEvents, timeEntries, runningEntry] = await Promise.all([
    fetchSyncedEvents(supabase, now),
    fetchTimeEntries(supabase, now),
    fetchRunningEntry(supabase),
  ]);
  const actualInputs = actualBlockInputs(timeEntries, runningEntry, now);
  const summary = computeGapSummary(planEvents, actualInputs, range);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-2xl font-bold tracking-tight">{S.heading}</h1>

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

      <div className="grid grid-cols-3 gap-3">
        <div className="border-line bg-surface rounded-xl border p-4">
          <p className="text-ink-muted text-xs">{S.planTotal}</p>
          <p className="font-mono text-base font-semibold whitespace-nowrap tabular-nums sm:text-lg">
            {formatDurationMinutes(summary.planTotalMinutes)}
          </p>
        </div>
        <div className="border-line bg-surface rounded-xl border p-4">
          <p className="text-ink-muted text-xs">{S.actualTotal}</p>
          <p className="font-mono text-base font-semibold whitespace-nowrap tabular-nums sm:text-lg">
            {formatDurationMinutes(summary.actualTotalMinutes)}
          </p>
        </div>
        <div className="border-line bg-surface rounded-xl border p-4">
          <p className="text-ink-muted text-xs">{S.gap}</p>
          <p className="font-mono text-base font-semibold whitespace-nowrap tabular-nums sm:text-lg">
            {formatSignedDurationMinutes(summary.gapMinutes)}
          </p>
          <p className="text-ink-muted font-mono text-xs tabular-nums">
            {summary.gapPercent === null
              ? S.gapPercentUnavailable
              : formatSignedPercent(summary.gapPercent)}
          </p>
        </div>
      </div>

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
                className="border-line bg-surface flex items-center justify-between gap-3 rounded-xl border px-4 py-3"
              >
                <div className="flex min-w-0 flex-col">
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  <p className="text-ink-muted text-xs">
                    {S.planTotal} {formatDurationMinutes(item.planMinutes)} /{" "}
                    {S.actualTotal} {formatDurationMinutes(item.actualMinutes)}
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
                className="border-line bg-surface flex items-center justify-between gap-3 rounded-xl border px-4 py-3"
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
    </main>
  );
}
