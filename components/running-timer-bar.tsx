"use client";

import { useSyncExternalStore } from "react";
import { formatElapsed } from "@/lib/timer/elapsed";
import { TIMER_MESSAGES as T } from "@/lib/timer/messages";
import type { RunningEntry } from "@/lib/timer/types";

// 実行中タイマーバー(P2-2)。タイトル+経過時間+停止ボタン。
// 経過時間は1秒ごとにクライアントで更新する(SSRとの不一致を避けるためサーバーでは非表示値)。

// 秒単位の現在時刻を外部ストアとして購読する(スナップショットは秒で安定させる)
function subscribeSecondTick(onTick: () => void): () => void {
  const timerId = setInterval(onTick, 1000);
  return () => clearInterval(timerId);
}
function useNowSeconds(): number | null {
  return useSyncExternalStore(
    subscribeSecondTick,
    () => Math.floor(Date.now() / 1000),
    () => null,
  );
}

interface RunningTimerBarProps {
  entry: RunningEntry;
  onStop: () => void;
  stopping: boolean;
}

export function RunningTimerBar({
  entry,
  onStop,
  stopping,
}: RunningTimerBarProps) {
  const nowSeconds = useNowSeconds();
  const now = nowSeconds === null ? null : new Date(nowSeconds * 1000);

  return (
    <div
      data-testid="running-timer-bar"
      className="sticky bottom-3 z-10 flex items-center justify-between gap-3 rounded-full border border-zinc-300 bg-white/95 py-2 pr-2 pl-4 shadow-lg backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95"
    >
      <div className="flex min-w-0 items-baseline gap-3">
        <p className="truncate text-sm font-medium">
          {entry.title || T.untitled}
        </p>
        <p
          aria-label="経過時間"
          className="shrink-0 text-sm text-zinc-600 tabular-nums dark:text-zinc-400"
        >
          {now ? formatElapsed(entry.startAt, now) : "0:00:00"}
        </p>
      </div>
      <button
        type="button"
        onClick={onStop}
        disabled={stopping}
        className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-red-600 px-5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50 dark:bg-red-500 dark:hover:bg-red-600"
      >
        {T.stop}
      </button>
    </div>
  );
}
