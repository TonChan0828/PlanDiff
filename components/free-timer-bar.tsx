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
      className="border-line bg-surface/95 sticky bottom-2 z-10 flex items-center gap-3 rounded-xl border py-2 pr-2 pl-4 shadow-lg backdrop-blur"
    >
      <input
        type="text"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={T.freePlaceholder}
        aria-label={T.freePlaceholder}
        disabled={pending}
        className="focus:border-line min-h-11 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 text-sm outline-none disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={pending}
        aria-label={T.freeStartLabel}
        className="bg-brand text-brand-ink hover:bg-brand/90 inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg px-5 text-sm font-bold transition-colors disabled:opacity-50"
      >
        {T.freeStart}
      </button>
    </form>
  );
}
