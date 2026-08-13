import { CALENDAR_MESSAGES as M } from "@/lib/calendar/messages";
import type { RuleAdjustmentNotice } from "@/lib/calendar/recurring-id";
import { formatDurationMinutes } from "@/lib/summary/format";

// 提案経由の定期予定の自動学習補正(P10-1)。仕様書: docs/specs/P10-1_提案経由予定の学習補正.md
// サイレントな自動変更を避けるため、変更が発生した回だけお知らせ帯で通知する。

function minutesOf(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0);
}

export function RuleAdjustmentBanner({
  notices,
}: {
  notices: RuleAdjustmentNotice[];
}) {
  if (notices.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      {notices.map((notice) => (
        <p
          key={notice.ruleId}
          role="status"
          className="border-plan-border/40 bg-plan-fill/20 text-ink rounded-lg border px-4 py-3 text-sm"
        >
          {M.ruleAdjustmentNotice(
            notice.title,
            notice.previousStartTime,
            notice.newStartTime,
            formatDurationMinutes(
              minutesOf(notice.previousEndTime) -
                minutesOf(notice.previousStartTime),
            ),
            formatDurationMinutes(
              minutesOf(notice.newEndTime) - minutesOf(notice.newStartTime),
            ),
          )}
        </p>
      ))}
    </div>
  );
}
