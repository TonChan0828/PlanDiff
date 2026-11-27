import { format, isSameDay, parseISO } from "date-fns";
import { TriangleAlert } from "lucide-react";
import { CALENDAR_MESSAGES as M } from "@/lib/calendar/messages";
import type { OverlapCandidate } from "@/lib/calendar/overlap";
import { jaMinimal as ja } from "@/lib/ui/ja-locale";

/** 一覧に出す件数。超えた分は件数だけを示す */
const MAX_LISTED = 3;

function timeLabel(event: OverlapCandidate): string {
  const start = parseISO(event.startAt);
  const end = parseISO(event.endAt);
  const endPattern = isSameDay(start, end) ? "HH:mm" : "M/d(E) HH:mm";
  return `${format(start, "M/d(E) HH:mm", { locale: ja })}〜${format(end, endPattern, { locale: ja })}`;
}

/**
 * 予定の重なりの警告(G-94)。保存は止めない。色だけに頼らず、アイコンと文言で示す。
 * status の領域は常に置き、中身だけを出し入れする。中身と同時に領域を挿入すると、
 * 支援技術が読み上げないことがあるため。空の間は -mt-4 でフォームの余白(gap-4)を打ち消す
 * (display: none は支援技術の対象から外れるので使わない)。
 */
export function OverlapWarning({ overlaps }: { overlaps: OverlapCandidate[] }) {
  return (
    <div role="status" className={overlaps.length === 0 ? "-mt-4" : undefined}>
      {overlaps.length === 0 ? null : <OverlapList overlaps={overlaps} />}
    </div>
  );
}

function OverlapList({ overlaps }: { overlaps: OverlapCandidate[] }) {
  return (
    <div className="border-interrupt/60 flex flex-col gap-1 rounded-lg border px-3 py-2 text-sm">
      <p className="flex items-start gap-1.5 font-medium">
        <TriangleAlert
          aria-hidden="true"
          className="text-interrupt mt-0.5 h-4 w-4 shrink-0"
        />
        {M.overlapHeading}
      </p>
      <ul className="text-ink-muted flex flex-col gap-0.5 text-xs">
        {overlaps.slice(0, MAX_LISTED).map((event) => (
          <li key={event.id} className="break-words">
            {M.overlapItem(timeLabel(event), event.title || M.untitled)}
          </li>
        ))}
      </ul>
      {overlaps.length > MAX_LISTED ? (
        <p className="text-ink-muted text-xs">
          {M.overlapMore(overlaps.length - MAX_LISTED)}
        </p>
      ) : null}
    </div>
  );
}
