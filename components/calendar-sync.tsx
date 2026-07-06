"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import { computeSyncRange } from "@/lib/google/sync-range";

// キャッシュ済み予定の簡易リスト+同期トリガ(マウント時+手動リフレッシュ)。
// タイムライン表示の本実装はP2-1。日時は端末のタイムゾーンで表示する。

export interface CalendarSyncEvent {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
}

const HEADING = "今週 ± 1週間の予定";
const REFRESH_LABEL = "更新";
const SYNCING_LABEL = "同期中…";
const EMPTY_MESSAGE = "表示できる予定がありません。";
const UNTITLED_LABEL = "(タイトルなし)";
const SYNC_ERROR_MESSAGE =
  "同期に失敗しました。時間をおいてもう一度お試しください";

interface DayGroup {
  key: string;
  label: string;
  events: CalendarSyncEvent[];
}

function groupByDay(events: CalendarSyncEvent[]): DayGroup[] {
  const groups = new Map<string, DayGroup>();
  const sorted = [...events].sort(
    (a, b) => parseISO(a.startAt).getTime() - parseISO(b.startAt).getTime(),
  );
  for (const event of sorted) {
    const start = parseISO(event.startAt);
    const key = format(start, "yyyy-MM-dd");
    const group = groups.get(key) ?? {
      key,
      label: format(start, "M月d日(E)", { locale: ja }),
      events: [],
    };
    group.events.push(event);
    groups.set(key, group);
  }
  return [...groups.values()];
}

export function CalendarSync({ events }: { events: CalendarSyncEvent[] }) {
  const router = useRouter();
  // 初期値 true = マウント直後のバックグラウンド同期中(要件定義書 §7.3)
  const [syncing, setSyncing] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 同期の再実行トリガ(手動リフレッシュでインクリメント)
  const [syncNonce, setSyncNonce] = useState(0);

  // キャッシュ表示を先行し、マウント時(と手動リフレッシュ時)にサーバーと同期する。
  // setState は fetch 完了後のコールバックでのみ行う
  useEffect(() => {
    let cancelled = false;

    const applyFailure = () => {
      if (cancelled) {
        return;
      }
      setErrorMessage(SYNC_ERROR_MESSAGE);
      setSyncing(false);
    };

    fetch("/api/calendar/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(computeSyncRange(new Date())),
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
  }, [router, syncNonce]);

  const handleRefresh = () => {
    setSyncing(true);
    setErrorMessage(null);
    setSyncNonce((nonce) => nonce + 1);
  };

  const eventsByDay = useMemo(() => groupByDay(events), [events]);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          {HEADING}
        </h2>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={syncing}
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-zinc-300 px-6 text-sm font-medium transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          {syncing ? SYNCING_LABEL : REFRESH_LABEL}
        </button>
      </div>
      {errorMessage ? (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {errorMessage}
        </p>
      ) : null}
      {eventsByDay.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {EMPTY_MESSAGE}
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {eventsByDay.map((group) => (
            <li key={group.key} className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                {group.label}
              </h3>
              <ul className="flex flex-col gap-1">
                {group.events.map((event) => (
                  <li
                    key={event.id}
                    className="flex items-baseline gap-3 rounded-lg bg-zinc-100 px-4 py-2 dark:bg-zinc-800"
                  >
                    <span className="shrink-0 text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
                      {format(parseISO(event.startAt), "HH:mm")}〜
                      {format(parseISO(event.endAt), "HH:mm")}
                    </span>
                    <span className="min-w-0 text-sm break-words">
                      {event.title || UNTITLED_LABEL}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
