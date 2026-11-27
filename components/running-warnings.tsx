import { format, isSameDay, parseISO } from "date-fns";
import { TriangleAlert } from "lucide-react";
import {
  isLongDuration,
  isPlanOverrun,
  LONG_ENTRY_HOURS,
} from "@/lib/timer/forgotten";
import { TIMER_MESSAGES as T } from "@/lib/timer/messages";

/** 予定の時刻の表示。今日でなければ日付も出す */
export function planTimeLabel(iso: string, baseIso: string): string {
  const time = parseISO(iso);
  return format(
    time,
    isSameDay(time, parseISO(baseIso)) ? "HH:mm" : "M/d HH:mm",
  );
}

/**
 * 実行中タイマーの止め忘れの警告(G-91)。status の領域は常に置き、中身だけを出し入れする
 * (中身と同時に領域を挿入すると、支援技術が読み上げないことがある)。
 * 文言に経過時間を入れないのは、毎秒の更新で繰り返し読み上げられないようにするため。
 */
export function RunningWarnings({
  startAt,
  plan,
  now,
  className = "",
  emptyClassName,
}: {
  startAt: string;
  /** 紐づく予定。画面のデータになければ省略する */
  plan?: { startAt: string; endAt: string };
  /** 現在時刻。サーバー描画では null(何も出さない) */
  now: Date | null;
  className?: string;
  /** 何も出さないときのクラス(親の余白を打ち消す) */
  emptyClassName?: string;
}) {
  const nowIso = now?.toISOString();
  const messages: string[] = [];
  if (nowIso && isPlanOverrun(plan, nowIso)) {
    messages.push(T.planOverrunRunning(planTimeLabel(plan!.endAt, nowIso)));
  }
  if (nowIso && isLongDuration(startAt, nowIso)) {
    messages.push(T.longRunning(LONG_ENTRY_HOURS));
  }
  return (
    <div
      role="status"
      className={messages.length > 0 ? className : emptyClassName}
    >
      {messages.map((message) => (
        <p key={message} className="flex items-start gap-1.5 text-sm">
          <TriangleAlert
            aria-hidden="true"
            className="text-interrupt mt-0.5 h-4 w-4 shrink-0"
          />
          <span className="min-w-0 break-words">{message}</span>
        </p>
      ))}
    </div>
  );
}
