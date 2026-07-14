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
  createAppEventAction,
  createRecurringRuleAction,
  deleteAppEventAction,
  deleteRecurringOccurrenceAction,
  deleteRecurringRuleAction,
  updateAppEventAction,
  updateRecurringRuleAction,
} from "@/app/(app)/calendar/event-actions";
import {
  deleteTimeEntryAction,
  startTimerAction,
  stopTimerAction,
  updateRunningStartAction,
  updateTimeEntryAction,
} from "@/app/(app)/calendar/timer-actions";
import {
  AppEventPanel,
  type AppEventPanelValues,
  type RecurringSubmitValues,
} from "@/components/app-event-panel";
import {
  EditEntryPanel,
  type EditEntryPanelEntry,
  type EditEntrySaveInput,
} from "@/components/edit-entry-panel";
import { EditStartPanel } from "@/components/edit-start-panel";
import { FreeTimerBar } from "@/components/free-timer-bar";
import {
  GoogleConnectionBanner,
  type GoogleConnectionStatus,
} from "@/components/google-connection-banner";
import { PlanSuggestions } from "@/components/plan-suggestions";
import { RecurringEditChoicePanel } from "@/components/recurring-edit-choice-panel";
import {
  RecurringRulePanel,
  type RecurringRulePanelValues,
} from "@/components/recurring-rule-panel";
import { RunningTimerBar } from "@/components/running-timer-bar";
import {
  layoutDayEvents,
  type CalendarBlock,
  type CalendarBlockInput,
} from "@/lib/calendar/layout";
import { CALENDAR_MESSAGES as M } from "@/lib/calendar/messages";
import {
  isRecurringEventId,
  parseRecurringEventId,
  type RecurringRuleSummary,
} from "@/lib/calendar/recurring-id";
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
  /** タイマー(time_entries)と紐づく予定キー(Google予定ID or "app:<uuid>") */
  googleEventId: string;
  /** 予定の由来。'app' はアプリ内作成(編集・削除可)。省略時は 'google' 扱い(P2-5) */
  source?: "google" | "app";
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
  /** Googleカレンダー連携済みか(サーバーで取得した初期状態。任意連携のためfalseでも表示は継続する) */
  googleConnected?: boolean;
  /** Google連携機能が有効か(凍結フラグ。falseなら同期・更新ボタン・バナーを出さない。P2-5) */
  googleEnabled?: boolean;
  /** 本人の繰り返し予定ルール一覧(P5-1)。「繰り返し全体」編集モードの初期値に使う */
  recurringRules?: RecurringRuleSummary[];
  /** 実績からの予定提案(P5-2)の元データ(表示週開始前4週の完了実績) */
  suggestionEntries?: TimeEntryItem[];
}

export function CalendarView({
  events,
  timeEntries = [],
  runningEntry = null,
  viewParam,
  dateParam,
  googleConnected = true,
  googleEnabled = true,
  recurringRules = [],
  suggestionEntries = [],
}: CalendarViewProps) {
  const router = useRouter();
  const hydrated = useHydrated();

  const view: CalendarViewMode = viewParam === "week" ? "week" : "day";
  // dateパラメータが妥当ならTZに依存せず確定する。省略・不正時はクライアントの「今日」
  const selectedDate =
    parseDateParam(dateParam) ?? (hydrated ? startOfDay(new Date()) : null);
  const now = hydrated ? new Date() : null;

  // ---- 同期(P1-2の挙動を維持): マウント時+表示週の変化+手動リフレッシュ ----
  // 凍結フラグOFF(googleEnabled=false)時は同期を一切行わない(P2-5)
  const [syncing, setSyncing] = useState(googleEnabled);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [syncNonce, setSyncNonce] = useState(0);
  // Google未連携/連携失効は強制遷移させず、バナー表示のみで通常描画を継続する(仕様書P1-3)
  const [connectionStatus, setConnectionStatus] = useState<
    GoogleConnectionStatus | "connected"
  >(googleConnected ? "connected" : "not_connected");
  const weekKey = selectedDate
    ? toDateParam(startOfWeek(selectedDate, { weekStartsOn: 1 }))
    : null;

  useEffect(() => {
    if (!googleEnabled || !weekKey) {
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
          setConnectionStatus("connected");
          router.refresh();
          return;
        }
        if (response.status === 401) {
          if (cancelled) {
            return;
          }
          const body = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          setSyncing(false);
          setConnectionStatus(
            body?.error === "reauthorize" ? "reauthorize" : "not_connected",
          );
          return;
        }
        applyFailure();
      })
      .catch(applyFailure);

    return () => {
      cancelled = true;
    };
  }, [router, weekKey, syncNonce, googleEnabled]);

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

  // ---- アプリ内予定の作成・編集・削除(P2-5): 楽観的更新はせずServer Action成功後にrefresh ----
  type EventPanelState =
    | { mode: "create"; initial: AppEventPanelValues }
    | {
        mode: "edit";
        eventId: string;
        googleEventId: string;
        initial: AppEventPanelValues;
      }
    | {
        mode: "choice";
        eventId: string;
        googleEventId: string;
        initial: AppEventPanelValues;
        ruleId: string;
      }
    | { mode: "rule-edit"; ruleId: string };
  const [eventPanel, setEventPanel] = useState<EventPanelState | null>(null);
  const [eventPending, setEventPending] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);

  // 作成モードの初期値: 選択中の日付で「次の正時から1時間」(例: 14:23 → 15:00〜16:00)
  const handleOpenCreateEvent = () => {
    const current = new Date();
    const baseDay = selectedDate ?? startOfDay(current);
    const start = new Date(
      baseDay.getFullYear(),
      baseDay.getMonth(),
      baseDay.getDate(),
      current.getHours() + 1,
      0,
      0,
      0,
    );
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    setEventError(null);
    setEventPanel({
      mode: "create",
      initial: {
        title: "",
        startAt: start.toISOString(),
        endAt: end.toISOString(),
      },
    });
  };

  const handleOpenEditEvent = (event: CalendarViewEvent) => {
    setEventError(null);
    const initial: AppEventPanelValues = {
      title: event.title,
      startAt: event.startAt,
      endAt: event.endAt,
    };
    const parsed = isRecurringEventId(event.googleEventId)
      ? parseRecurringEventId(event.googleEventId)
      : null;
    if (parsed) {
      setEventPanel({
        mode: "choice",
        eventId: event.id,
        googleEventId: event.googleEventId,
        initial,
        ruleId: parsed.ruleId,
      });
      return;
    }
    setEventPanel({
      mode: "edit",
      eventId: event.id,
      googleEventId: event.googleEventId,
      initial,
    });
  };

  // 定期予定(P5-1): 「この予定のみ」→単発編集モードへ、「繰り返し全体」→ルール編集モードへ
  const handleChooseOccurrence = () => {
    if (!eventPanel || eventPanel.mode !== "choice") {
      return;
    }
    setEventPanel({
      mode: "edit",
      eventId: eventPanel.eventId,
      googleEventId: eventPanel.googleEventId,
      initial: eventPanel.initial,
    });
  };

  const handleChooseSeries = () => {
    if (!eventPanel || eventPanel.mode !== "choice") {
      return;
    }
    setEventPanel({ mode: "rule-edit", ruleId: eventPanel.ruleId });
  };

  const handleCloseEventPanel = () => {
    if (eventPending) {
      return;
    }
    setEventPanel(null);
    setEventError(null);
  };

  const handleSaveEvent = (values: AppEventPanelValues) => {
    if (
      !eventPanel ||
      eventPending ||
      (eventPanel.mode !== "create" && eventPanel.mode !== "edit")
    ) {
      return;
    }
    const failureMessage =
      eventPanel.mode === "create" ? M.eventCreateError : M.eventUpdateError;
    setEventPending(true);
    setEventError(null);
    const action =
      eventPanel.mode === "create"
        ? createAppEventAction(values)
        : updateAppEventAction(eventPanel.eventId, values);
    action
      .then((result) => {
        if (result.ok) {
          setEventPanel(null);
          router.refresh();
        } else {
          setEventError(failureMessage);
        }
      })
      .catch(() => setEventError(failureMessage))
      .finally(() => setEventPending(false));
  };

  const handleDeleteEvent = () => {
    if (!eventPanel || eventPanel.mode !== "edit" || eventPending) {
      return;
    }
    setEventPending(true);
    setEventError(null);
    // rec: 予定(この回のみ削除)は例外記録+行削除、それ以外は従来どおりの削除(P5-1)
    const action = isRecurringEventId(eventPanel.googleEventId)
      ? deleteRecurringOccurrenceAction(eventPanel.eventId)
      : deleteAppEventAction(eventPanel.eventId);
    action
      .then((result) => {
        if (result.ok) {
          setEventPanel(null);
          router.refresh();
        } else {
          setEventError(M.eventDeleteError);
        }
      })
      .catch(() => setEventError(M.eventDeleteError))
      .finally(() => setEventPending(false));
  };

  // 定期予定(P5-1): 作成時の繰り返しルール保存
  const handleSaveRecurringRule = (values: RecurringSubmitValues) => {
    if (!eventPanel || eventPanel.mode !== "create" || eventPending) {
      return;
    }
    setEventPending(true);
    setEventError(null);
    createRecurringRuleAction(values)
      .then((result) => {
        if (result.ok) {
          setEventPanel(null);
          router.refresh();
        } else {
          setEventError(M.recurrenceCreateError);
        }
      })
      .catch(() => setEventError(M.recurrenceCreateError))
      .finally(() => setEventPending(false));
  };

  // 定期予定(P5-1): 「繰り返し全体」編集の保存・削除
  const handleSaveRuleEdit = (values: RecurringRulePanelValues) => {
    if (!eventPanel || eventPanel.mode !== "rule-edit" || eventPending) {
      return;
    }
    const rule = recurringRules.find((r) => r.id === eventPanel.ruleId);
    if (!rule) {
      return;
    }
    setEventPending(true);
    setEventError(null);
    updateRecurringRuleAction(rule.id, {
      title: values.title,
      pattern: values.pattern,
      weekdays: values.weekdays,
      startTime: values.startTime,
      endTime: values.endTime,
      timezone: rule.timezone,
      startsOn: rule.startsOn,
      endsOn: values.endsOn,
    })
      .then((result) => {
        if (result.ok) {
          setEventPanel(null);
          router.refresh();
        } else {
          setEventError(M.recurrenceUpdateError);
        }
      })
      .catch(() => setEventError(M.recurrenceUpdateError))
      .finally(() => setEventPending(false));
  };

  const handleDeleteRule = () => {
    if (!eventPanel || eventPanel.mode !== "rule-edit" || eventPending) {
      return;
    }
    setEventPending(true);
    setEventError(null);
    deleteRecurringRuleAction(eventPanel.ruleId)
      .then((result) => {
        if (result.ok) {
          setEventPanel(null);
          router.refresh();
        } else {
          setEventError(M.recurrenceDeleteError);
        }
      })
      .catch(() => setEventError(M.recurrenceDeleteError))
      .finally(() => setEventPending(false));
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
    <section className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={M.navPrev}
            onClick={() => handleNavigate("prev")}
            className="border-line hover:bg-ink/5 inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border text-sm transition-colors"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={handleToday}
            className="border-line hover:bg-ink/5 inline-flex min-h-11 items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors"
          >
            {M.navToday}
          </button>
          <button
            type="button"
            aria-label={M.navNext}
            onClick={() => handleNavigate("next")}
            className="border-line hover:bg-ink/5 inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border text-sm transition-colors"
          >
            ›
          </button>
        </div>
        <p className="font-mono text-sm font-medium tabular-nums">
          {rangeLabel}
        </p>
        <div className="flex items-center gap-1">
          <div
            role="group"
            aria-label="表示切替"
            className="border-line flex overflow-hidden rounded-lg border"
          >
            {(["day", "week"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={view === mode}
                onClick={() => handleViewChange(mode)}
                className={`inline-flex min-h-11 items-center justify-center px-3.5 text-sm font-medium transition-colors ${
                  view === mode ? "bg-brand text-brand-ink" : "hover:bg-ink/5"
                }`}
              >
                {mode === "day" ? M.viewDay : M.viewWeek}
              </button>
            ))}
          </div>
          {googleEnabled ? (
            <button
              type="button"
              onClick={handleRefresh}
              disabled={syncing}
              className="border-line hover:bg-ink/5 inline-flex min-h-11 items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {syncing ? M.syncing : M.refresh}
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleOpenCreateEvent}
            className="bg-brand text-brand-ink hover:bg-brand/90 inline-flex min-h-11 items-center justify-center rounded-lg px-3.5 text-sm font-medium transition-colors"
          >
            {M.eventAdd}
          </button>
        </div>
      </div>

      {errorMessage ? (
        <p
          role="alert"
          className="bg-danger/10 text-danger rounded-lg px-4 py-3 text-sm"
        >
          {errorMessage}
        </p>
      ) : null}

      {timerError ? (
        <p
          role="alert"
          className="bg-danger/10 text-danger rounded-lg px-4 py-3 text-sm"
        >
          {timerError}
        </p>
      ) : null}

      {googleEnabled && connectionStatus !== "connected" ? (
        <GoogleConnectionBanner status={connectionStatus} />
      ) : null}

      {selectedDate ? (
        <PlanSuggestions
          entries={suggestionEntries}
          events={events}
          recurringRules={recurringRules}
          viewDate={toDateParam(selectedDate)}
        />
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
                  ? "bg-brand text-brand-ink font-semibold"
                  : "text-ink-muted"
              }`}
            >
              <span>{format(day, "E", { locale: ja })}</span>
              <span className="font-mono tabular-nums">{format(day, "d")}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className="border-line bg-surface relative min-h-64 flex-1 overflow-y-auto rounded-xl border"
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
                className="text-ink-muted absolute right-1 -translate-y-1/2 font-mono text-[10px] tabular-nums"
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
                onEditEvent={handleOpenEditEvent}
                onEditActual={handleEditActual}
                now={now}
                showTime={view === "day"}
              />
            ))
          ) : (
            <div className="border-line/60 relative border-l">
              <HourLines />
            </div>
          )}
        </div>
        {rangeIsEmpty ? (
          <div className="absolute top-3 left-12 flex flex-col gap-1">
            <p className="text-ink-muted text-sm">{M.empty}</p>
            <p className="text-ink-muted text-sm">{M.emptyAddHint}</p>
          </div>
        ) : null}
      </div>

      {running ? (
        <RunningTimerBar
          entry={running}
          onStop={handleStopTimer}
          stopping={timerPending}
          onEditStart={handleOpenEditStart}
        />
      ) : (
        <FreeTimerBar onStart={handleStartFreeTimer} pending={timerPending} />
      )}

      {running && editingStart ? (
        <EditStartPanel
          initialStartAt={running.startAt}
          onSave={handleSaveStart}
          onClose={handleCloseEditStart}
          pending={startPending}
          error={startError}
        />
      ) : null}

      {eventPanel && eventPanel.mode === "choice" ? (
        <RecurringEditChoicePanel
          onChooseOccurrence={handleChooseOccurrence}
          onChooseSeries={handleChooseSeries}
          onClose={handleCloseEventPanel}
        />
      ) : null}

      {eventPanel &&
      (eventPanel.mode === "create" || eventPanel.mode === "edit") ? (
        <AppEventPanel
          key={eventPanel.mode === "edit" ? eventPanel.eventId : "create"}
          mode={eventPanel.mode}
          initial={eventPanel.initial}
          onSave={handleSaveEvent}
          onSaveRecurring={
            eventPanel.mode === "create" ? handleSaveRecurringRule : undefined
          }
          onDelete={eventPanel.mode === "edit" ? handleDeleteEvent : undefined}
          onClose={handleCloseEventPanel}
          pending={eventPending}
          error={eventError}
        />
      ) : null}

      {eventPanel && eventPanel.mode === "rule-edit"
        ? (() => {
            const rule = recurringRules.find(
              (candidate) => candidate.id === eventPanel.ruleId,
            );
            if (!rule) {
              return null;
            }
            return (
              <RecurringRulePanel
                key={rule.id}
                initial={rule}
                onSave={handleSaveRuleEdit}
                onDelete={handleDeleteRule}
                onClose={handleCloseEventPanel}
                pending={eventPending}
                error={eventError}
              />
            );
          })()
        : null}

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
          className="absolute right-0 left-0 border-t"
          style={{
            top: `${hour * HOUR_PX}px`,
            borderColor: "var(--grid-hour)",
          }}
        />
      ))}
    </>
  );
}

// 方眼背景(D-2)。15分刻みの薄い水平線+垂直線で「方眼紙に時間を記録する」質感を出す。
// 水平ピッチは HOUR_PX/4(15分)、垂直は同じピッチの正方格子
const GRID_BACKGROUND_STYLE = {
  backgroundImage:
    "repeating-linear-gradient(to bottom, var(--grid) 0 1px, transparent 1px 14px)," +
    "repeating-linear-gradient(to right, var(--grid) 0 1px, transparent 1px 14px)",
} as const;

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
                  ? "border-brand bg-brand text-brand-ink font-semibold"
                  : isToday
                    ? "border-brand/50 font-semibold"
                    : "border-line text-ink-muted hover:bg-ink/5"
              }`}
            >
              <span>{format(day, "E", { locale: ja })}</span>
              <span className="font-mono tabular-nums">{format(day, "d")}</span>
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
  onEditEvent,
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
  onEditEvent: (event: CalendarViewEvent) => void;
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
    <div
      className="border-line/60 relative border-l"
      style={GRID_BACKGROUND_STYLE}
    >
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
            onEdit={onEditEvent}
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
      {isToday && now ? (
        <div
          data-testid="current-time-line"
          aria-hidden="true"
          className="border-danger absolute right-0 left-0 border-t-2"
          style={{ top: `${nowPercent}%` }}
        >
          <span className="bg-danger absolute top-0 left-0.5 -translate-y-1/2 rounded px-1 py-px font-mono text-[9px] leading-tight font-bold text-white tabular-nums">
            {format(now, "HH:mm")}
          </span>
        </div>
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
  onEdit,
}: {
  block: CalendarBlock<CalendarViewEvent>;
  showTime: boolean;
  isRunning: boolean;
  disabled: boolean;
  onTap: (event: CalendarViewEvent) => void;
  onEdit: (event: CalendarViewEvent) => void;
}) {
  const widthPercent = 100 / block.columnCount;
  const timeLabel = `${format(parseISO(block.startAt), "HH:mm")}〜${format(parseISO(block.endAt), "HH:mm")}`;
  const tapLabel = isRunning
    ? T.stopLabel(block.title)
    : T.startLabel(block.title);
  const viewEvent: CalendarViewEvent = {
    id: block.id,
    googleEventId: block.googleEventId,
    title: block.title,
    startAt: block.startAt,
    endAt: block.endAt,
    source: block.source,
  };
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
        onClick={() => onTap(viewEvent)}
        className={`block h-full w-full overflow-hidden border px-1 py-0.5 text-left disabled:opacity-60 ${
          isRunning
            ? "border-brand bg-plan-fill border-2"
            : "border-plan-border bg-plan-fill hover:bg-brand/15"
        } ${block.clippedStart ? "" : "rounded-t-md"} ${
          block.clippedEnd ? "" : "rounded-b-md"
        }`}
      >
        {/* 週ビュー(時刻非表示)は列が狭いため1〜2行で省略する */}
        <p
          className={`text-plan-text text-xs leading-tight font-medium break-words ${
            showTime ? "" : "line-clamp-2"
          }`}
        >
          {isRecurringEventId(block.googleEventId) ? (
            <span aria-hidden="true" title={M.recurringMarkLabel}>
              {M.recurringMark}{" "}
            </span>
          ) : null}
          {block.title || M.untitled}
        </p>
        {isRunning ? (
          <p className="text-plan-text text-[10px] font-semibold">
            {T.recording}
          </p>
        ) : null}
        {showTime ? (
          <p className="text-plan-text/80 font-mono text-[10px] tabular-nums">
            {timeLabel}
          </p>
        ) : null}
      </button>
      {/* アプリ内予定のみ編集導線(P2-5)。本体ボタン(タイマー)とは兄弟要素で重ねる */}
      {block.source === "app" ? (
        <button
          type="button"
          aria-label={M.eventEditLabel(block.title)}
          onClick={() => onEdit(viewEvent)}
          className="bg-surface/90 text-plan-text hover:bg-surface absolute top-0.5 right-0.5 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full text-xs shadow-sm"
        >
          ✎
        </button>
      ) : null}
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

// ズレ(開始遅延・超過)を示す斜線ハッチ。ストライプ柄で色以外の手がかりも与える(ui-quality Skill)。
// 色はトークン(柿)に追随する(D-2)
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
      className="border-interrupt/70 pointer-events-none absolute right-0 left-0 border-x"
      style={{
        top: `${topPercent}%`,
        height: `${Math.max(heightPercent, 0.5)}%`,
        backgroundImage:
          "repeating-linear-gradient(135deg, var(--hatch) 0px, var(--hatch) 4px, transparent 4px, transparent 8px)",
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
  // 紐づく実績は群青(予定と同系色)、フリー/割り込みは柿で区別する(FR-06/D-2)
  const colorClassName = gap.linked
    ? "border-brand bg-brand"
    : "border-interrupt bg-interrupt";
  const textColorClassName = "text-white";

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
        <p className="text-[10px] font-semibold text-white/90">{T.freeBadge}</p>
      ) : null}
      {gap.startDelayMinutes > 0 ? (
        <p className="font-mono text-[10px] font-bold text-white/90 tabular-nums">
          {T.delayLabel(gap.startDelayMinutes)}
        </p>
      ) : null}
      {gap.overrunMinutes > 0 ? (
        <p className="font-mono text-[10px] font-bold text-white/90 tabular-nums">
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
