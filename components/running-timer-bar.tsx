"use client";

import { format, parseISO } from "date-fns";
import { formatElapsed } from "@/lib/timer/elapsed";
import { TIMER_MESSAGES as T } from "@/lib/timer/messages";
import { useNowSeconds } from "@/lib/timer/use-now-seconds";
import type { RunningEntry } from "@/lib/timer/types";

// 実行中タイマーバー(P2-2)。タイトル+経過時間+停止ボタン。
// 経過時間は1秒ごとにクライアントで更新する(SSRとの不一致を避けるためサーバーでは非表示値)。
// onEditStartが渡された場合は開始時刻ボタンを表示し、タップで変更パネルを開く(D-4)

interface RunningTimerBarProps {
  entry: RunningEntry;
  onStop: () => void;
  stopping: boolean;
  /** 開始時刻変更パネルを開く(D-4)。省略時はボタンを出さない */
  onEditStart?: () => void;
}

export function RunningTimerBar({
  entry,
  onStop,
  stopping,
  onEditStart,
}: RunningTimerBarProps) {
  const nowSeconds = useNowSeconds();
  const now = nowSeconds === null ? null : new Date(nowSeconds * 1000);
  const startTime = format(parseISO(entry.startAt), "HH:mm");

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
        {onEditStart ? (
          <button
            type="button"
            onClick={onEditStart}
            aria-label={T.runningSinceLabel(startTime)}
            className="text-ink-muted hover:text-ink inline-flex min-h-11 shrink-0 items-center font-mono text-xs tabular-nums underline underline-offset-2"
          >
            {startTime}〜
          </button>
        ) : null}
        <p
          aria-label="経過時間"
          className="text-ink-muted shrink-0 font-mono text-lg font-semibold tabular-nums"
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
