"use client";

import {
  Fragment,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
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
  deleteTimeEntryAction,
  startTimerAction,
  stopTimerAction,
  updateTimeEntryAction,
} from "@/app/(app)/calendar/timer-actions";
import {
  EditEntryPanel,
  type EditEntryPanelEntry,
  type EditEntrySaveInput,
} from "@/components/edit-entry-panel";
import { FreeTimerBar } from "@/components/free-timer-bar";
import { RunningTimerBar } from "@/components/running-timer-bar";
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
import { actualBlockInputs, type ActualBlockInput } from "@/lib/timer/blocks";
import {
  computeActualGaps,
  type ActualGapInfo,
  type ActualGapInput,
  type PlanEventForGap,
} from "@/lib/timer/gap";
import { TIMER_MESSAGES as T } from "@/lib/timer/messages";
import type { RunningEntry, TimeEntryItem } from "@/lib/timer/types";

// カレンダービュー本体(P2-1/P2-2)。日/週タイムライン+ナビゲーション+同期トリガ+タイマー操作。
// FR-06のオーバーレイ規約を先取りし、予定=左55%レーンに薄い塗り、実績=右45%レーンに濃い塗りで置く。
// 予定ブロックのタップでタイマーを開始/停止する(楽観的更新。確定はServer Action)。

export type CalendarViewEvent = CalendarBlockInput & {
  /** タイマー(time_entries)と紐づくGoogle予定ID */
  googleEventId: string;
};

const HOUR_PX = 56; // 1時間の高さ(375pxの1画面に約8時間)
const DAY_MINUTES = 24 * 60;
const PLAN_LANE_PERCENT = 55; // 予定レーン(左寄せ)の幅
const ACTUAL_LANE_PERCENT = 45; // 実績レーン(右寄せ)の幅
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
  /** 表示範囲内の確定済み実績 */
  timeEntries?: TimeEntryItem[];
  /** 実行中タイマー(サーバーで取得した初期状態) */
  runningEntry?: RunningEntry | null;
  viewParam?: string;
  dateParam?: string;
}

export function CalendarView({
  events,
  timeEntries = [],
  runningEntry = null,
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

  // ---- タイマー(P2-2): 楽観的更新+Server Action。失敗時はロールバック ----
  const [running, setRunning] = useState<RunningEntry | null>(runningEntry);
  const [timerPending, setTimerPending] = useState(false);
  const [timerError, setTimerError] = useState<string | null>(null);

  // router.refresh 等でサーバー状態(props)が更新されたら追従する(render中の派生state調整パターン)
  const [prevRunningEntry, setPrevRunningEntry] = useState(runningEntry);
  if (prevRunningEntry !== runningEntry) {
    setPrevRunningEntry(runningEntry);
    setRunning(runningEntry);
  }

  const handleStartTimer = (event: CalendarViewEvent) => {
    if (timerPending) {
      return;
    }
    const previous = running;
    setTimerError(null);
    setTimerPending(true);
    // 楽観的更新(実IDと開始時刻はサーバー確定後に refresh で置き換わる)
    setRunning({
      id: `optimistic-${event.googleEventId}`,
      title: event.title,
      googleEventId: event.googleEventId,
      startAt: new Date().toISOString(),
    });
    startTimerAction({ googleEventId: event.googleEventId, title: event.title })
      .then((result) => {
        if (result.ok) {
          router.refresh();
        } else {
          setRunning(previous);
          setTimerError(T.startError);
        }
      })
      .catch(() => {
        setRunning(previous);
        setTimerError(T.startError);
      })
      .finally(() => setTimerPending(false));
  };

  const handleStopTimer = () => {
    if (timerPending || !running) {
      return;
    }
    const previous = running;
    setTimerError(null);
    setTimerPending(true);
    setRunning(null);
    stopTimerAction()
      .then((result) => {
        if (result.ok) {
          router.refresh();
        } else {
          setRunning(previous);
          setTimerError(T.stopError);
        }
      })
      .catch(() => {
        setRunning(previous);
        setTimerError(T.stopError);
      })
      .finally(() => setTimerPending(false));
  };

  const handleStartFreeTimer = (title: string) => {
    if (timerPending) {
      return;
    }
    const previous = running;
    setTimerError(null);
    setTimerPending(true);
    // 楽観的更新(実IDと開始時刻はサーバー確定後に refresh で置き換わる)
    setRunning({
      id: "optimistic-free",
      title,
      googleEventId: null,
      startAt: new Date().toISOString(),
    });
    startTimerAction({ googleEventId: null, title })
      .then((result) => {
        if (result.ok) {
          router.refresh();
        } else {
          setRunning(previous);
          setTimerError(T.startError);
        }
      })
      .catch(() => {
        setRunning(previous);
        setTimerError(T.startError);
      })
      .finally(() => setTimerPending(false));
  };

  const handleBlockTap = (event: CalendarViewEvent) => {
    if (running && running.googleEventId === event.googleEventId) {
      handleStopTimer();
    } else {
      handleStartTimer(event);
    }
  };

  // ---- 実績の手動編集(P2-4): 確定済み実績のみ対象。楽観的更新はせずServer Action成功後にrefresh ----
  const [editingEntry, setEditingEntry] = useState<EditEntryPanelEntry | null>(
    null,
  );
  const [editPending, setEditPending] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const handleEditActual = (block: ActualBlockInput) => {
    if (!block.editable) {
      return;
    }
    setEditError(null);
    setEditingEntry({
      id: block.id,
      title: block.title,
      startAt: block.startAt,
      endAt: block.endAt,
    });
  };

  const handleCloseEdit = () => {
    if (editPending) {
      return;
    }
    setEditingEntry(null);
    setEditError(null);
  };

  const handleSaveEdit = (input: EditEntrySaveInput) => {
    if (!editingEntry || editPending) {
      return;
    }
    setEditPending(true);
    setEditError(null);
    updateTimeEntryAction(editingEntry.id, input)
      .then((result) => {
        if (result.ok) {
          setEditingEntry(null);
          router.refresh();
        } else {
          setEditError(T.updateError);
        }
      })
      .catch(() => setEditError(T.updateError))
      .finally(() => setEditPending(false));
  };

  const handleDeleteEditing = () => {
    if (!editingEntry || editPending) {
      return;
    }
    setEditPending(true);
    setEditError(null);
    deleteTimeEntryAction(editingEntry.id)
      .then((result) => {
        if (result.ok) {
          setEditingEntry(null);
          router.refresh();
        } else {
          setEditError(T.deleteError);
        }
      })
      .catch(() => setEditError(T.deleteError))
      .finally(() => setEditPending(false));
  };

  // 実績レーンの入力(確定済み+実行中)。実行中ブロックは現在時刻に依存するためハイドレーション後のみ
  const actualInputs = actualBlockInputs(
    timeEntries,
    now ? running : null,
    now ?? new Date(0),
  );

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

      {timerError ? (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {timerError}
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
                actualInputs={actualInputs}
                runningEventId={running?.googleEventId ?? null}
                timerPending={timerPending}
                onBlockTap={handleBlockTap}
                onEditActual={handleEditActual}
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

      {running ? (
        <RunningTimerBar
          entry={running}
          onStop={handleStopTimer}
          stopping={timerPending}
        />
      ) : (
        <FreeTimerBar onStart={handleStartFreeTimer} pending={timerPending} />
      )}

      {editingEntry ? (
        <EditEntryPanel
          key={editingEntry.id}
          entry={editingEntry}
          onSave={handleSaveEdit}
          onDelete={handleDeleteEditing}
          onClose={handleCloseEdit}
          pending={editPending}
          error={editError}
        />
      ) : null}
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
  actualInputs,
  runningEventId,
  timerPending,
  onBlockTap,
  onEditActual,
  now,
  showTime,
}: {
  day: Date;
  events: CalendarViewEvent[];
  actualInputs: ActualBlockInput[];
  runningEventId: string | null;
  timerPending: boolean;
  onBlockTap: (event: CalendarViewEvent) => void;
  onEditActual: (block: ActualBlockInput) => void;
  now: Date | null;
  showTime: boolean;
}) {
  const blocks = layoutDayEvents(events, day);
  const actualBlocks = layoutDayEvents(actualInputs, day);
  const isToday = now ? isSameDay(day, now) : false;
  const nowPercent = now
    ? (differenceInMinutes(now, startOfDay(now)) / DAY_MINUTES) * 100
    : 0;

  // ズレ計算(P3-1)。紐づき判定はgoogleEventIdで行い、開始遅延・超過を求める
  const planByEventId = new Map(
    blocks.map((block) => [block.googleEventId, block]),
  );
  const gapInputs: ActualGapInput[] = actualBlocks.map((block) => ({
    id: block.id,
    googleEventId: block.googleEventId,
    startAt: block.startAt,
    endAt: block.endAt,
  }));
  const planForGap: PlanEventForGap[] = blocks.map((block) => ({
    googleEventId: block.googleEventId,
    startAt: block.startAt,
    endAt: block.endAt,
  }));
  const gaps = computeActualGaps(gapInputs, planForGap);

  return (
    <div className="relative border-l border-zinc-100 dark:border-zinc-800">
      <HourLines />
      {/* 予定レーン(左55%) */}
      <ul
        className="absolute inset-y-0 left-0"
        style={{ width: `${PLAN_LANE_PERCENT}%` }}
      >
        {blocks.map((block) => (
          <PlanBlock
            key={block.id}
            block={block}
            showTime={showTime}
            isRunning={runningEventId === block.googleEventId}
            disabled={timerPending}
            onTap={onBlockTap}
          />
        ))}
      </ul>
      {/* 実績レーン(右45%)。濃い塗り。紐づく実績は同系色、フリー/割り込みは別色(P3-1) */}
      <ul
        className="absolute inset-y-0 right-0"
        style={{ width: `${ACTUAL_LANE_PERCENT}%` }}
      >
        {actualBlocks.map((block) => {
          const gap: ActualGapInfo = gaps.get(block.id) ?? {
            linked: false,
            startDelayMinutes: 0,
            overrunMinutes: 0,
          };
          const plan = block.googleEventId
            ? planByEventId.get(block.googleEventId)
            : undefined;
          const delayBar =
            gap.startDelayMinutes > 0 && plan
              ? gapBarStyle(day, plan.startAt, block.startAt)
              : null;
          const overrunBar =
            gap.overrunMinutes > 0 && plan
              ? gapBarStyle(day, plan.endAt, block.endAt)
              : null;
          return (
            <Fragment key={block.id}>
              {delayBar ? <GapStripe testId="gap-delay" {...delayBar} /> : null}
              <ActualBlock
                block={block}
                gap={gap}
                showTime={showTime}
                onEdit={onEditActual}
              />
              {overrunBar ? (
                <GapStripe testId="gap-overrun" {...overrunBar} />
              ) : null}
            </Fragment>
          );
        })}
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
  isRunning,
  disabled,
  onTap,
}: {
  block: CalendarBlock<CalendarViewEvent>;
  showTime: boolean;
  isRunning: boolean;
  disabled: boolean;
  onTap: (event: CalendarViewEvent) => void;
}) {
  const widthPercent = 100 / block.columnCount;
  const timeLabel = `${format(parseISO(block.startAt), "HH:mm")}〜${format(parseISO(block.endAt), "HH:mm")}`;
  const tapLabel = isRunning
    ? T.stopLabel(block.title)
    : T.startLabel(block.title);
  return (
    <li
      className="absolute"
      style={{
        top: `${block.topPercent}%`,
        height: `${block.heightPercent}%`,
        left: `${block.column * widthPercent}%`,
        width: `calc(${widthPercent}% - 2px)`,
      }}
    >
      <button
        type="button"
        aria-label={tapLabel}
        aria-pressed={isRunning}
        disabled={disabled}
        onClick={() =>
          onTap({
            id: block.id,
            googleEventId: block.googleEventId,
            title: block.title,
            startAt: block.startAt,
            endAt: block.endAt,
          })
        }
        className={`block h-full w-full overflow-hidden border px-1 py-0.5 text-left disabled:opacity-60 ${
          isRunning
            ? "border-2 border-sky-600 bg-sky-100/80 dark:border-sky-400 dark:bg-sky-950/60"
            : "border-sky-300 bg-sky-100/80 hover:bg-sky-200/80 dark:border-sky-800 dark:bg-sky-950/60 dark:hover:bg-sky-900/60"
        } ${block.clippedStart ? "" : "rounded-t-md"} ${
          block.clippedEnd ? "" : "rounded-b-md"
        }`}
      >
        {/* 週ビュー(時刻非表示)は列が狭いため1〜2行で省略する */}
        <p
          className={`text-xs leading-tight font-medium break-words text-sky-900 dark:text-sky-200 ${
            showTime ? "" : "line-clamp-2"
          }`}
        >
          {block.title || M.untitled}
        </p>
        {isRunning ? (
          <p className="text-[10px] font-semibold text-sky-700 dark:text-sky-300">
            {T.recording}
          </p>
        ) : null}
        {showTime ? (
          <p className="text-[10px] text-sky-700 tabular-nums dark:text-sky-400">
            {timeLabel}
          </p>
        ) : null}
      </button>
    </li>
  );
}

// 日の0時からの経過分(範囲外は0〜DAY_MINUTESにクランプ)
function minutesFromDayStart(iso: string, day: Date): number {
  return Math.min(
    Math.max(differenceInMinutes(parseISO(iso), startOfDay(day)), 0),
    DAY_MINUTES,
  );
}

/** ズレ装飾バーの位置(日基準の%)。予定時刻〜実績時刻の区間を表す */
function gapBarStyle(
  day: Date,
  fromIso: string,
  toIso: string,
): { topPercent: number; heightPercent: number } {
  const fromMinutes = minutesFromDayStart(fromIso, day);
  const toMinutes = minutesFromDayStart(toIso, day);
  return {
    topPercent: (fromMinutes / DAY_MINUTES) * 100,
    heightPercent: ((toMinutes - fromMinutes) / DAY_MINUTES) * 100,
  };
}

// ズレ(開始遅延・超過)を示す装飾バー。ストライプ柄で色以外の手がかりも与える(ui-quality Skill)
function GapStripe({
  testId,
  topPercent,
  heightPercent,
}: {
  testId: string;
  topPercent: number;
  heightPercent: number;
}) {
  return (
    <li
      data-testid={testId}
      aria-hidden="true"
      className="pointer-events-none absolute right-0 left-0 border-x border-amber-600/70"
      style={{
        top: `${topPercent}%`,
        height: `${Math.max(heightPercent, 0.5)}%`,
        backgroundImage:
          "repeating-linear-gradient(135deg, rgba(180,83,9,0.5) 0px, rgba(180,83,9,0.5) 4px, transparent 4px, transparent 8px)",
      }}
    />
  );
}

function ActualBlock({
  block,
  gap,
  showTime,
  onEdit,
}: {
  block: CalendarBlock<ActualBlockInput>;
  gap: ActualGapInfo;
  showTime: boolean;
  onEdit: (block: ActualBlockInput) => void;
}) {
  const widthPercent = 100 / block.columnCount;
  const positionStyle = {
    top: `${block.topPercent}%`,
    height: `${block.heightPercent}%`,
    left: `${block.column * widthPercent}%`,
    width: `calc(${widthPercent}% - 2px)`,
  };
  const roundedClassName = `${block.clippedStart ? "" : "rounded-t-md"} ${
    block.clippedEnd ? "" : "rounded-b-md"
  }`;
  // 紐づく実績はsky系(予定と同系色)、フリー/割り込みはamber系で区別する(FR-06)
  const colorClassName = gap.linked
    ? "border-sky-700 bg-sky-600/90 dark:border-sky-400 dark:bg-sky-500/80"
    : "border-amber-700 bg-amber-600/90 dark:border-amber-400 dark:bg-amber-500/80";
  const textColorClassName = gap.linked
    ? "text-white dark:text-sky-950"
    : "text-white dark:text-amber-950";

  // 色だけに依存せずテキストでもズレ・紐づき状態を伝える(ui-quality Skill)
  const gapSuffix = !gap.linked
    ? `(${T.freeBadge})`
    : gap.startDelayMinutes > 0 && gap.overrunMinutes > 0
      ? `(${T.delayLabel(gap.startDelayMinutes)}、${T.overrunLabel(gap.overrunMinutes)})`
      : gap.startDelayMinutes > 0
        ? `(${T.delayLabel(gap.startDelayMinutes)})`
        : gap.overrunMinutes > 0
          ? `(${T.overrunLabel(gap.overrunMinutes)})`
          : "";

  const detailNode = showTime ? (
    <>
      {!gap.linked ? (
        <p className="text-[10px] font-semibold text-amber-50">{T.freeBadge}</p>
      ) : null}
      {gap.startDelayMinutes > 0 ? (
        <p className="text-[10px] font-semibold text-amber-50">
          {T.delayLabel(gap.startDelayMinutes)}
        </p>
      ) : null}
      {gap.overrunMinutes > 0 ? (
        <p className="text-[10px] font-semibold text-amber-50">
          {T.overrunLabel(gap.overrunMinutes)}
        </p>
      ) : null}
    </>
  ) : null;

  const titleNode = (
    <>
      <p
        className={`line-clamp-2 text-xs leading-tight font-medium break-words ${textColorClassName}`}
      >
        {block.title || M.untitled}
      </p>
      {detailNode}
    </>
  );

  if (!block.editable) {
    return (
      <li
        data-testid="actual-block"
        className={`absolute overflow-hidden border px-1 py-0.5 ${colorClassName} ${roundedClassName}`}
        style={positionStyle}
      >
        {titleNode}
      </li>
    );
  }

  return (
    <li data-testid="actual-block" className="absolute" style={positionStyle}>
      <button
        type="button"
        aria-label={`${T.editLabel(block.title)}${gapSuffix}`}
        onClick={() => onEdit(block)}
        className={`block h-full w-full overflow-hidden border px-1 py-0.5 text-left ${colorClassName} ${roundedClassName}`}
      >
        {titleNode}
      </button>
    </li>
  );
}
