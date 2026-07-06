"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  differenceInMinutes,
  format,
  isSameDay,
  parseISO,
  startOfDay,
  startOfWeek,
} from "date-fns";
import { ja } from "date-fns/locale";
import {
  layoutDayEvents,
  type CalendarBlock,
  type CalendarBlockInput,
} from "@/lib/calendar/layout";
import { CALENDAR_MESSAGES as M } from "@/lib/calendar/messages";
import {
  buildCalendarPath,
  parseDateParam,
  shiftDate,
  toDateParam,
  weekDaysOf,
  type CalendarViewMode,
} from "@/lib/calendar/view-date";
import { computeSyncRange } from "@/lib/google/sync-range";

// カレンダービュー本体(P2-1)。日/週タイムライン+ナビゲーション+同期トリガ。
// 予定ブロックはFR-06のオーバーレイ規約を先取りし、日列の左55%レーンに薄い塗りで置く
// (右側はP2-2以降の実績ブロック用)。

export type CalendarViewEvent = CalendarBlockInput;

const HOUR_PX = 56; // 1時間の高さ(375pxの1画面に約8時間)
const DAY_MINUTES = 24 * 60;
const PLAN_LANE_PERCENT = 55; // 予定レーン(左寄せ)の幅
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

// SSR(サーバーTZ)とクライアントTZの不一致を避けるため、
// 「今日」や時刻位置に依存する描画はハイドレーション完了後に行う
const emptySubscribe = () => () => {};
function useHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

interface CalendarViewProps {
  events: CalendarViewEvent[];
  viewParam?: string;
  dateParam?: string;
}

export function CalendarView({
  events,
  viewParam,
  dateParam,
}: CalendarViewProps) {
  const router = useRouter();
  const hydrated = useHydrated();

  const view: CalendarViewMode = viewParam === "week" ? "week" : "day";
  // dateパラメータが妥当ならTZに依存せず確定する。省略・不正時はクライアントの「今日」
  const selectedDate =
    parseDateParam(dateParam) ?? (hydrated ? startOfDay(new Date()) : null);
  const now = hydrated ? new Date() : null;

  // ---- 同期(P1-2の挙動を維持): マウント時+表示週の変化+手動リフレッシュ ----
  const [syncing, setSyncing] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [syncNonce, setSyncNonce] = useState(0);
  const weekKey = selectedDate
    ? toDateParam(startOfWeek(selectedDate, { weekStartsOn: 1 }))
    : null;

  useEffect(() => {
    if (!weekKey) {
      return;
    }
    let cancelled = false;

    const applyFailure = () => {
      if (cancelled) {
        return;
      }
      setErrorMessage(M.syncError);
      setSyncing(false);
    };

    fetch("/api/calendar/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      // weekKey(その週の月曜)から表示週±1週間を計算する
      body: JSON.stringify(computeSyncRange(parseDateParam(weekKey)!)),
    })
      .then(async (response) => {
        if (cancelled) {
          return;
        }
        if (response.ok) {
          setSyncing(false);
          router.refresh();
          return;
        }
        if (response.status === 401) {
          const body = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          router.push(
            body?.error === "reauthorize" ? "/auth/reauthorize" : "/login",
          );
          return;
        }
        applyFailure();
      })
      .catch(applyFailure);

    return () => {
      cancelled = true;
    };
  }, [router, weekKey, syncNonce]);

  // ---- 初期スクロール: 8:00付近(今日で現在時刻が8時以降なら現在時刻−1時間) ----
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) {
      return;
    }
    const current = new Date();
    const targetHour = Math.max(current.getHours() - 1, 8);
    container.scrollTop = Math.min(targetHour, 16) * HOUR_PX;
  }, [view]);

  const handleNavigate = (direction: "prev" | "next") => {
    if (selectedDate) {
      router.push(
        buildCalendarPath(view, shiftDate(view, selectedDate, direction)),
      );
    }
  };
  const handleToday = () => {
    router.push(buildCalendarPath(view, new Date()));
  };
  const handleViewChange = (mode: CalendarViewMode) => {
    if (selectedDate) {
      router.push(buildCalendarPath(mode, selectedDate));
    }
  };
  const handleRefresh = () => {
    setSyncing(true);
    setErrorMessage(null);
    setSyncNonce((nonce) => nonce + 1);
  };

  const days = selectedDate
    ? view === "week"
      ? weekDaysOf(selectedDate)
      : [selectedDate]
    : [];
  const rangeLabel = selectedDate
    ? view === "week"
      ? `${format(days[0]!, "yyyy年M月d日", { locale: ja })}〜${format(days[6]!, "M月d日", { locale: ja })}`
      : format(selectedDate, "yyyy年M月d日(E)", { locale: ja })
    : "";
  const rangeIsEmpty =
    days.length > 0 &&
    days.every((day) => layoutDayEvents(events, day).length === 0);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={M.navPrev}
            onClick={() => handleNavigate("prev")}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-zinc-300 text-sm transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={handleToday}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-zinc-300 px-4 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            {M.navToday}
          </button>
          <button
            type="button"
            aria-label={M.navNext}
            onClick={() => handleNavigate("next")}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-zinc-300 text-sm transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            ›
          </button>
        </div>
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {rangeLabel}
        </p>
        <div className="flex items-center gap-1">
          <div
            role="group"
            aria-label="表示切替"
            className="flex overflow-hidden rounded-full border border-zinc-300 dark:border-zinc-700"
          >
            {(["day", "week"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={view === mode}
                onClick={() => handleViewChange(mode)}
                className={`inline-flex min-h-11 items-center justify-center px-4 text-sm font-medium transition-colors ${
                  view === mode
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                {mode === "day" ? M.viewDay : M.viewWeek}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={syncing}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-zinc-300 px-4 text-sm font-medium transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            {syncing ? M.syncing : M.refresh}
          </button>
        </div>
      </div>

      {errorMessage ? (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {errorMessage}
        </p>
      ) : null}

      {view === "day" && selectedDate && now ? (
        <WeekStrip
          selectedDate={selectedDate}
          today={now}
          onSelect={(day) => router.push(buildCalendarPath("day", day))}
        />
      ) : null}

      {view === "week" && selectedDate ? (
        <div className="grid grid-cols-[2.5rem_repeat(7,minmax(0,1fr))] gap-px pr-1">
          <div aria-hidden="true" />
          {days.map((day) => (
            <div
              key={toDateParam(day)}
              data-week-day-header
              aria-current={now && isSameDay(day, now) ? "date" : undefined}
              className={`flex flex-col items-center rounded-md py-1 text-xs ${
                now && isSameDay(day, now)
                  ? "bg-zinc-900 font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-600 dark:text-zinc-400"
              }`}
            >
              <span>{format(day, "E", { locale: ja })}</span>
              <span className="tabular-nums">{format(day, "d")}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className="relative max-h-[65dvh] overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800"
      >
        <div
          className={`grid ${
            view === "week"
              ? "grid-cols-[2.5rem_repeat(7,minmax(0,1fr))]"
              : "grid-cols-[2.5rem_minmax(0,1fr)]"
          }`}
          style={{ height: `${24 * HOUR_PX}px` }}
        >
          {/* 時間軸 */}
          <div className="relative" aria-hidden="true">
            {HOURS.map((hour) => (
              <span
                key={hour}
                className="absolute right-1 -translate-y-1/2 text-[10px] text-zinc-400 tabular-nums dark:text-zinc-500"
                style={{ top: `${hour * HOUR_PX}px` }}
              >
                {hour === 0 ? "" : `${hour}:00`}
              </span>
            ))}
          </div>
          {/* 日列 */}
          {days.length > 0 ? (
            days.map((day) => (
              <DayColumn
                key={toDateParam(day)}
                day={day}
                events={events}
                now={now}
                showTime={view === "day"}
              />
            ))
          ) : (
            <div className="relative border-l border-zinc-100 dark:border-zinc-800">
              <HourLines />
            </div>
          )}
        </div>
        {rangeIsEmpty ? (
          <p className="absolute top-3 left-12 text-sm text-zinc-500 dark:text-zinc-400">
            {M.empty}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function HourLines() {
  return (
    <>
      {HOURS.map((hour) => (
        <div
          key={hour}
          aria-hidden="true"
          className="absolute right-0 left-0 border-t border-zinc-100 dark:border-zinc-800"
          style={{ top: `${hour * HOUR_PX}px` }}
        />
      ))}
    </>
  );
}

function WeekStrip({
  selectedDate,
  today,
  onSelect,
}: {
  selectedDate: Date;
  today: Date;
  onSelect: (day: Date) => void;
}) {
  return (
    <ul className="grid grid-cols-7 gap-1">
      {weekDaysOf(selectedDate).map((day) => {
        const isSelected = isSameDay(day, selectedDate);
        const isToday = isSameDay(day, today);
        return (
          <li key={toDateParam(day)}>
            <button
              type="button"
              aria-pressed={isSelected}
              aria-current={isToday ? "date" : undefined}
              aria-label={format(day, "M月d日(E)", { locale: ja })}
              onClick={() => onSelect(day)}
              className={`flex min-h-11 w-full flex-col items-center justify-center rounded-lg border text-xs transition-colors ${
                isSelected
                  ? "border-zinc-900 bg-zinc-900 font-semibold text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                  : isToday
                    ? "border-zinc-400 font-semibold dark:border-zinc-500"
                    : "border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`}
            >
              <span>{format(day, "E", { locale: ja })}</span>
              <span className="tabular-nums">{format(day, "d")}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function DayColumn({
  day,
  events,
  now,
  showTime,
}: {
  day: Date;
  events: CalendarViewEvent[];
  now: Date | null;
  showTime: boolean;
}) {
  const blocks = layoutDayEvents(events, day);
  const isToday = now ? isSameDay(day, now) : false;
  const nowPercent = now
    ? (differenceInMinutes(now, startOfDay(now)) / DAY_MINUTES) * 100
    : 0;

  return (
    <div className="relative border-l border-zinc-100 dark:border-zinc-800">
      <HourLines />
      {/* 予定レーン(左55%)。右側はP2-2以降の実績ブロック用 */}
      <ul
        className="absolute inset-y-0 left-0"
        style={{ width: `${PLAN_LANE_PERCENT}%` }}
      >
        {blocks.map((block) => (
          <PlanBlock key={block.id} block={block} showTime={showTime} />
        ))}
      </ul>
      {isToday ? (
        <div
          data-testid="current-time-line"
          aria-hidden="true"
          className="absolute right-0 left-0 border-t-2 border-red-500"
          style={{ top: `${nowPercent}%` }}
        />
      ) : null}
    </div>
  );
}

function PlanBlock({
  block,
  showTime,
}: {
  block: CalendarBlock;
  showTime: boolean;
}) {
  const widthPercent = 100 / block.columnCount;
  const timeLabel = `${format(parseISO(block.startAt), "HH:mm")}〜${format(parseISO(block.endAt), "HH:mm")}`;
  return (
    <li
      className={`absolute overflow-hidden border border-sky-300 bg-sky-100/80 px-1 py-0.5 dark:border-sky-800 dark:bg-sky-950/60 ${
        block.clippedStart ? "" : "rounded-t-md"
      } ${block.clippedEnd ? "" : "rounded-b-md"}`}
      style={{
        top: `${block.topPercent}%`,
        height: `${block.heightPercent}%`,
        left: `${block.column * widthPercent}%`,
        width: `calc(${widthPercent}% - 2px)`,
      }}
    >
      {/* 週ビュー(時刻非表示)は列が狭いため1〜2行で省略する */}
      <p
        className={`text-xs leading-tight font-medium break-words text-sky-900 dark:text-sky-200 ${
          showTime ? "" : "line-clamp-2"
        }`}
      >
        {block.title || M.untitled}
      </p>
      {showTime ? (
        <p className="text-[10px] text-sky-700 tabular-nums dark:text-sky-400">
          {timeLabel}
        </p>
      ) : null}
    </li>
  );
}
