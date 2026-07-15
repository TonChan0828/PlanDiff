"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { differenceInMinutes, format, parseISO } from "date-fns";
import {
  startTimerAction,
  stopTimerAction,
  updateRunningStartAction,
} from "@/app/(app)/calendar/timer-actions";
import { createAppEventAction } from "@/app/(app)/calendar/event-actions";
import {
  AppEventPanel,
  type AppEventPanelValues,
} from "@/components/app-event-panel";
import { EditStartPanel } from "@/components/edit-start-panel";
import { FreeTimerBar } from "@/components/free-timer-bar";
import { RunningTimerHero } from "@/components/running-timer-hero";
import { CALENDAR_MESSAGES as M } from "@/lib/calendar/messages";
import { formatDurationMinutes } from "@/lib/summary/format";
import { TIMER_MESSAGES as T } from "@/lib/timer/messages";
import type { RunningEntry, TimeEntryItem } from "@/lib/timer/types";
import { TRACK_MESSAGES as TR } from "@/lib/track/messages";
import { buildPromotionDefaults } from "@/lib/track/promotion";
import {
  selectQuickStartEvents,
  type QuickStartEvent,
} from "@/lib/track/quick-start";
import { filterTodayEntries } from "@/lib/track/today-entries";

// 計測画面本体(P2-6)。カレンダーを経由しない計測の実施と当日実績の確認に絞る。
// タイマー操作はカレンダービュー(P2-2/P2-3)と同じ楽観的更新+Server Actionのパターン。
// フリー実績の「予定にする」昇格導線でコアループ(計画→記録→ギャップ)へ還流させる(FR-11)。

// SSR(サーバーTZ)とクライアントTZの不一致を避けるため、
// 「今日」「進行中」の判定を含む描画はハイドレーション完了後に行う
const emptySubscribe = () => () => {};
function useHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

interface TrackViewProps {
  /** 表示範囲(今日を含む週±1週間)の予定。抽出はクライアントで行う */
  events: QuickStartEvent[];
  /** 表示範囲内の確定済み実績 */
  timeEntries: TimeEntryItem[];
  /** 実行中タイマー(サーバーで取得した初期状態) */
  runningEntry: RunningEntry | null;
}

export function TrackView({
  events,
  timeEntries,
  runningEntry,
}: TrackViewProps) {
  const router = useRouter();
  const hydrated = useHydrated();
  const now = hydrated ? new Date() : null;

  // ---- タイマー: 楽観的更新+Server Action。失敗時はロールバック(P2-2と同パターン) ----
  const [running, setRunning] = useState<RunningEntry | null>(runningEntry);
  const [timerPending, setTimerPending] = useState(false);
  const [timerError, setTimerError] = useState<string | null>(null);

  // router.refresh 等でサーバー状態(props)が更新されたら追従する(render中の派生state調整パターン)
  const [prevRunningEntry, setPrevRunningEntry] = useState(runningEntry);
  if (prevRunningEntry !== runningEntry) {
    setPrevRunningEntry(runningEntry);
    setRunning(runningEntry);
  }

  const startTimer = (googleEventId: string | null, title: string) => {
    if (timerPending) {
      return;
    }
    const previous = running;
    setTimerError(null);
    setTimerPending(true);
    // 楽観的更新(実IDと開始時刻はサーバー確定後に refresh で置き換わる)
    setRunning({
      id: `optimistic-${googleEventId ?? "free"}`,
      title,
      googleEventId,
      startAt: new Date().toISOString(),
    });
    startTimerAction({ googleEventId, title })
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

  const handleQuickStartTap = (event: QuickStartEvent) => {
    if (running && running.googleEventId === event.googleEventId) {
      handleStopTimer();
    } else {
      startTimer(event.googleEventId, event.title);
    }
  };

  // ---- 開始時刻変更(D-4): 実行中エントリのstart_atをその場で修正する ----
  const [editingStart, setEditingStart] = useState(false);
  const [startPending, setStartPending] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const handleOpenEditStart = () => {
    setStartError(null);
    setEditingStart(true);
  };

  const handleCloseEditStart = () => {
    if (startPending) {
      return;
    }
    setEditingStart(false);
    setStartError(null);
  };

  const handleSaveStart = (startAtIso: string) => {
    if (startPending) {
      return;
    }
    setStartPending(true);
    setStartError(null);
    updateRunningStartAction(startAtIso)
      .then((result) => {
        if (result.ok) {
          setEditingStart(false);
          router.refresh();
        } else {
          setStartError(T.editStartError);
        }
      })
      .catch(() => setStartError(T.editStartError))
      .finally(() => setStartPending(false));
  };

  // ---- 昇格導線: フリー実績 → アプリ内予定の作成(P2-5のパネル・Server Actionを再利用) ----
  const [promotionInitial, setPromotionInitial] =
    useState<AppEventPanelValues | null>(null);
  const [promotionPending, setPromotionPending] = useState(false);
  const [promotionError, setPromotionError] = useState<string | null>(null);

  const handleOpenPromotion = (entry: TimeEntryItem) => {
    setPromotionError(null);
    setPromotionInitial(buildPromotionDefaults(entry));
  };

  const handleClosePromotion = () => {
    if (promotionPending) {
      return;
    }
    setPromotionInitial(null);
    setPromotionError(null);
  };

  const handleSavePromotion = (values: AppEventPanelValues) => {
    if (promotionPending) {
      return;
    }
    setPromotionPending(true);
    setPromotionError(null);
    createAppEventAction(values)
      .then((result) => {
        if (result.ok) {
          setPromotionInitial(null);
          router.refresh();
        } else {
          setPromotionError(M.eventCreateError);
        }
      })
      .catch(() => setPromotionError(M.eventCreateError))
      .finally(() => setPromotionPending(false));
  };

  const quickStartEvents = now ? selectQuickStartEvents(events, now) : [];
  const todayEntries = now ? filterTodayEntries(timeEntries, now) : [];

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(20rem,0.95fr)] lg:items-start">
      {timerError ? (
        <p
          role="alert"
          className="bg-danger/10 text-danger rounded-lg px-4 py-3 text-sm lg:col-span-2"
        >
          {timerError}
        </p>
      ) : null}

      <div className="flex min-w-0 flex-col gap-6">
        {running ? (
          <RunningTimerHero
            entry={running}
            onStop={handleStopTimer}
            stopping={timerPending}
            onEditStart={handleOpenEditStart}
          />
        ) : (
          <FreeTimerBar
            onStart={(title) => startTimer(null, title)}
            pending={timerPending}
          />
        )}

        {quickStartEvents.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h2 className="text-ink-muted text-sm font-semibold">
              {TR.quickStartHeading}
            </h2>
            <ul
              aria-label={TR.quickStartHeading}
              className="flex flex-col gap-2"
            >
              {quickStartEvents.map((event) => {
                const isRunning =
                  running?.googleEventId === event.googleEventId;
                const isOngoing =
                  now !== null &&
                  parseISO(event.startAt).getTime() <= now.getTime();
                return (
                  <li key={event.id}>
                    <button
                      type="button"
                      aria-label={
                        isRunning
                          ? T.stopLabel(event.title)
                          : T.startLabel(event.title)
                      }
                      aria-pressed={isRunning}
                      disabled={timerPending}
                      onClick={() => handleQuickStartTap(event)}
                      className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border px-4 py-2 text-left transition-colors disabled:opacity-60 ${
                        isRunning
                          ? "border-brand bg-plan-fill border-2"
                          : "border-plan-border bg-plan-fill hover:bg-brand/15"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="text-plan-text block truncate text-sm font-medium">
                          {event.title || M.untitled}
                        </span>
                        <span className="text-plan-text/80 block font-mono text-xs tabular-nums">
                          {format(parseISO(event.startAt), "HH:mm")}〜
                          {format(parseISO(event.endAt), "HH:mm")}
                        </span>
                      </span>
                      <span className="text-plan-text shrink-0 text-xs font-semibold">
                        {isRunning
                          ? T.recording
                          : isOngoing
                            ? TR.ongoingBadge
                            : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-ink-muted text-sm font-semibold">
            {TR.todayHeading}
          </h2>
          <Link
            href="/calendar"
            className="text-ink-muted hover:text-ink inline-flex min-h-11 items-center text-xs underline underline-offset-2"
          >
            {TR.editHint}
          </Link>
        </div>
        {hydrated && todayEntries.length === 0 ? (
          <p className="border-line text-ink-muted rounded-lg border border-dashed px-4 py-6 text-center text-sm">
            {TR.emptyToday}
          </p>
        ) : (
          <ul aria-label={TR.todayHeading} className="flex flex-col gap-2">
            {todayEntries.map((entry) => {
              const linked = entry.googleEventId !== null;
              const minutes = differenceInMinutes(
                parseISO(entry.endAt),
                parseISO(entry.startAt),
              );
              return (
                <li
                  key={entry.id}
                  className="border-line bg-surface flex items-center justify-between gap-3 rounded-lg border px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {entry.title || M.untitled}
                    </p>
                    <p className="text-ink-muted font-mono text-xs tabular-nums">
                      {format(parseISO(entry.startAt), "HH:mm")}〜
                      {format(parseISO(entry.endAt), "HH:mm")}(
                      {formatDurationMinutes(minutes)})・
                      {linked ? TR.linkedBadge : TR.freeBadge}
                    </p>
                  </div>
                  {!linked ? (
                    <button
                      type="button"
                      aria-label={TR.promoteLabel(entry.title)}
                      onClick={() => handleOpenPromotion(entry)}
                      className="border-line hover:bg-ink/5 inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border px-4 text-sm font-medium transition-colors"
                    >
                      {TR.promote}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {running && editingStart ? (
        <EditStartPanel
          initialStartAt={running.startAt}
          onSave={handleSaveStart}
          onClose={handleCloseEditStart}
          pending={startPending}
          error={startError}
        />
      ) : null}

      {promotionInitial ? (
        <AppEventPanel
          mode="create"
          initial={promotionInitial}
          onSave={handleSavePromotion}
          onClose={handleClosePromotion}
          pending={promotionPending}
          error={promotionError}
        />
      ) : null}
    </section>
  );
}
