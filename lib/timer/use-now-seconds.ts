"use client";

import { useSyncExternalStore } from "react";

// 秒単位の現在時刻を外部ストアとして購読する(P2-2)。
// SSRとの不一致を避けるためサーバースナップショットはnull。
// RunningTimerBarとRunningTimerHeroで共用する(D-4で抽出)

function subscribeSecondTick(onTick: () => void): () => void {
  const timerId = setInterval(onTick, 1000);
  return () => clearInterval(timerId);
}

export function useNowSeconds(): number | null {
  return useSyncExternalStore(
    subscribeSecondTick,
    () => Math.floor(Date.now() / 1000),
    () => null,
  );
}
