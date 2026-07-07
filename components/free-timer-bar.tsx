"use client";

import { useState } from "react";
import { TIMER_MESSAGES as T } from "@/lib/timer/messages";

// フリータイマー開始フォーム(P2-3)。実行中なしのときにRunningTimerBarの代わりに表示する。
// タイトルは空欄可。送信時に前後の空白をtrimする。

interface FreeTimerBarProps {
  onStart: (title: string) => void;
  pending: boolean;
}

export function FreeTimerBar({ onStart, pending }: FreeTimerBarProps) {
  const [title, setTitle] = useState("");

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) {
      return;
    }
    onStart(title.trim());
  };

  return (
    <form
      data-testid="free-timer-bar"
      onSubmit={handleSubmit}
      className="sticky bottom-3 z-10 flex items-center gap-3 rounded-full border border-zinc-300 bg-white/95 py-2 pr-2 pl-4 shadow-lg backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95"
    >
      <input
        type="text"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={T.freePlaceholder}
        aria-label={T.freePlaceholder}
        disabled={pending}
        className="min-h-11 min-w-0 flex-1 rounded-full border border-transparent bg-transparent px-2 text-sm outline-none focus:border-zinc-300 disabled:opacity-50 dark:focus:border-zinc-600"
      />
      <button
        type="submit"
        disabled={pending}
        aria-label={T.freeStartLabel}
        className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-zinc-900 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {T.freeStart}
      </button>
    </form>
  );
}
