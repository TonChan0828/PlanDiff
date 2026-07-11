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
      className="border-line bg-surface/95 sticky bottom-2 z-10 flex items-center gap-3 rounded-xl border py-2 pr-2 pl-4 shadow-lg backdrop-blur"
    >
      {/* 記録中のドット(柿)。点滅はprefers-reduced-motionで停止する(D-2) */}
      <span
        aria-hidden="true"
        className="bg-interrupt h-2 w-2 shrink-0 animate-pulse rounded-full motion-reduce:animate-none"
      />
      <div className="flex min-w-0 flex-1 items-baseline gap-3">
        <p className="truncate text-sm font-medium">
          {entry.title || T.untitled}
        </p>
        <p
          aria-label="経過時間"
          className="text-ink-muted shrink-0 font-mono text-sm font-semibold tabular-nums"
        >
          {now ? formatElapsed(entry.startAt, now) : "0:00:00"}
        </p>
      </div>
      <button
        type="button"
        onClick={onStop}
        disabled={stopping}
        className="bg-danger hover:bg-danger/90 inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg px-5 text-sm font-bold text-white transition-colors disabled:opacity-50"
      >
        {T.stop}
      </button>
    </div>
  );
}
