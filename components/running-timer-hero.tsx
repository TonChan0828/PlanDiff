"use client";

import { format, parseISO } from "date-fns";
import { formatElapsed } from "@/lib/timer/elapsed";
import { TIMER_MESSAGES as T } from "@/lib/timer/messages";
import { useNowSeconds } from "@/lib/timer/use-now-seconds";
import type { RunningEntry } from "@/lib/timer/types";

// 計測ヒーロー(D-4)。計測画面で経過時間を主役として特大表示する。
// 秒部分は淡色にして毎秒の桁の暴れを視覚的に抑える。
// 開始時刻の変更は親(TrackView)がパネルを開いて行う

interface RunningTimerHeroProps {
  entry: RunningEntry;
  onStop: () => void;
  stopping: boolean;
  onEditStart: () => void;
}

export function RunningTimerHero({
  entry,
  onStop,
  stopping,
  onEditStart,
}: RunningTimerHeroProps) {
  const nowSeconds = useNowSeconds();
  const elapsed =
    nowSeconds === null
      ? "0:00:00"
      : formatElapsed(entry.startAt, new Date(nowSeconds * 1000));
  // 「H:MM」と「:SS」に分ける(末尾3文字が秒)
  const elapsedMain = elapsed.slice(0, -3);
  const elapsedSeconds = elapsed.slice(-3);
  const startTime = format(parseISO(entry.startAt), "HH:mm");

  return (
    <section
      data-testid="running-timer-hero"
      className="border-line bg-surface flex flex-col items-center gap-1 rounded-2xl border px-4 pt-4 pb-4"
    >
      <p className="text-ink-muted flex items-center gap-1.5 self-start text-xs font-bold">
        {/* 記録中のドット(柿)。点滅はprefers-reduced-motionで停止する */}
        <span
          aria-hidden="true"
          className="bg-interrupt h-2 w-2 animate-pulse rounded-full motion-reduce:animate-none"
        />
        {T.recording}
      </p>
      <p
        aria-label="経過時間"
        className="mt-1 font-mono text-[3.5rem] leading-none font-semibold tracking-tight tabular-nums"
      >
        {elapsedMain}
        <span className="text-ink-muted">{elapsedSeconds}</span>
      </p>
      <p className="mt-1 text-sm font-semibold">{entry.title || T.untitled}</p>
      <div className="mt-3 flex w-full items-stretch gap-2">
        <button
          type="button"
          onClick={onEditStart}
          className="border-line hover:bg-ink/5 inline-flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-xl border text-sm font-semibold transition-colors"
        >
          開始 <span className="font-mono tabular-nums">{startTime}</span>{" "}
          を変更
        </button>
        <button
          type="button"
          onClick={onStop}
          disabled={stopping}
          className="bg-danger hover:bg-danger/90 inline-flex min-h-12 flex-1 items-center justify-center rounded-xl text-sm font-extrabold text-white transition-colors disabled:opacity-50"
        >
          {T.stop}
        </button>
      </div>
    </section>
  );
}
