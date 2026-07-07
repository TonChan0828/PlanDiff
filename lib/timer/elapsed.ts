import { parseISO } from "date-fns";

// 実行中タイマーの経過時間を「H:MM:SS」で整形する(P2-2)。
// 時間は24時間を超えても繰り上げない。クライアント時計のズレで負になる場合は0に丸める。

export function formatElapsed(startAtIso: string, now: Date): string {
  const totalSeconds = Math.max(
    0,
    Math.floor((now.getTime() - parseISO(startAtIso).getTime()) / 1000),
  );
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
