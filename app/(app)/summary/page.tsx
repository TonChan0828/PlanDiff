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
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">{S.heading}</h1>
        <Link
          href="/calendar"
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-zinc-300 px-6 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          {S.backToCalendar}
        </Link>
      </div>

      <div
        role="group"
        aria-label={S.heading}
        className="flex w-fit overflow-hidden rounded-full border border-zinc-300 dark:border-zinc-700"
      >
        <Link
          href="/summary?range=today"
          aria-pressed={activeRange === "today"}
          className={`inline-flex min-h-11 items-center justify-center px-4 text-sm font-medium transition-colors ${
            activeRange === "today"
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
          }`}
        >
          {S.todayTab}
        </Link>
        <Link
          href="/summary?range=week"
          aria-pressed={activeRange === "week"}
          className={`inline-flex min-h-11 items-center justify-center px-4 text-sm font-medium transition-colors ${
            activeRange === "week"
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
          }`}
        >
          {S.weekTab}
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {S.planTotal}
          </p>
          <p className="text-lg font-semibold tabular-nums">
            {formatDurationMinutes(summary.planTotalMinutes)}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {S.actualTotal}
          </p>
          <p className="text-lg font-semibold tabular-nums">
            {formatDurationMinutes(summary.actualTotalMinutes)}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{S.gap}</p>
          <p className="text-lg font-semibold tabular-nums">
            {formatSignedDurationMinutes(summary.gapMinutes)}
          </p>
          <p className="text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
            {summary.gapPercent === null
              ? S.gapPercentUnavailable
              : formatSignedPercent(summary.gapPercent)}
          </p>
        </div>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          {S.itemsHeading}
        </h2>
        {summary.items.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {S.itemsEmpty}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {summary.items.map((item) => (
              <li
                key={item.googleEventId}
                className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800"
              >
                <div className="flex min-w-0 flex-col">
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {S.planTotal} {formatDurationMinutes(item.planMinutes)} /{" "}
                    {S.actualTotal} {formatDurationMinutes(item.actualMinutes)}
                  </p>
                </div>
                {item.notStarted ? (
                  <span className="shrink-0 rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    {S.notStarted}
                  </span>
                ) : (
                  <span className="shrink-0 text-sm font-medium tabular-nums">
                    {formatSignedDurationMinutes(item.gapMinutes)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          {S.interruptionsHeading}
        </h2>
        {summary.interruptions.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {S.interruptionsEmpty}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {summary.interruptions.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800"
              >
                <p className="truncate text-sm font-medium">{item.title}</p>
                <span className="shrink-0 text-sm text-zinc-600 tabular-nums dark:text-zinc-400">
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
