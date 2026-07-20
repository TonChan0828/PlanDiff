import { describe, expect, it } from "vitest";
import { isSameDay } from "date-fns";
import { groupEntriesByDay } from "@/lib/track/entry-groups";
import type { TimeEntryItem } from "@/lib/timer/types";

// 仕様書: docs/specs/P2-6_計測画面.md S3 / S13〜S16
// 「今日」および暦日の判定はユーザー(実行環境)のローカルTZで行う

const now = new Date(2026, 6, 11, 22, 0, 0, 0); // 2026-07-11 22:00(ローカル)

function entry(
  id: string,
  title: string,
  start: Date,
  end: Date,
): TimeEntryItem {
  return {
    id,
    title,
    googleEventId: null,
    startAt: start.toISOString(),
    endAt: end.toISOString(),
  };
}

describe("groupEntriesByDay", () => {
  it("S13: 複数日にまたがる実績が、新しい日付順のグループ・各グループ内は開始降順で返る", () => {
    const entries = [
      entry(
        "d2-morning",
        "一昨日の朝",
        new Date(2026, 6, 9, 9, 0),
        new Date(2026, 6, 9, 10, 0),
      ),
      entry(
        "d1-evening",
        "昨日の夜",
        new Date(2026, 6, 10, 20, 0),
        new Date(2026, 6, 10, 21, 0),
      ),
      entry(
        "d1-morning",
        "昨日の朝",
        new Date(2026, 6, 10, 9, 0),
        new Date(2026, 6, 10, 9, 30),
      ),
      entry(
        "d0-morning",
        "今日の朝",
        new Date(2026, 6, 11, 9, 0),
        new Date(2026, 6, 11, 9, 30),
      ),
      entry(
        "d0-evening",
        "今日の夜",
        new Date(2026, 6, 11, 20, 0),
        new Date(2026, 6, 11, 21, 0),
      ),
    ];

    const groups = groupEntriesByDay(entries, now);

    expect(groups.map((g) => g.entries.map((e) => e.id))).toEqual([
      ["d0-evening", "d0-morning"], // 今日: 開始降順
      ["d1-evening", "d1-morning"], // 昨日: 開始降順
      ["d2-morning"], // 一昨日
    ]);
  });

  it("S14: 当日グループのみ isToday が true、過去日は false", () => {
    const entries = [
      entry(
        "today",
        "今日の作業",
        new Date(2026, 6, 11, 9, 0),
        new Date(2026, 6, 11, 10, 0),
      ),
      entry(
        "yesterday",
        "昨日の作業",
        new Date(2026, 6, 10, 9, 0),
        new Date(2026, 6, 10, 10, 0),
      ),
    ];

    const groups = groupEntriesByDay(entries, now);

    expect(groups).toHaveLength(2);
    expect(groups[0]!.isToday).toBe(true);
    expect(isSameDay(groups[0]!.date, now)).toBe(true);
    expect(groups[1]!.isToday).toBe(false);
  });

  it("S15: 未来日(翌日)に開始した実績はどのグループにも含まれない", () => {
    const entries = [
      entry(
        "today",
        "今日の作業",
        new Date(2026, 6, 11, 9, 0),
        new Date(2026, 6, 11, 10, 0),
      ),
      entry(
        "tomorrow",
        "明日の作業",
        new Date(2026, 6, 12, 9, 0),
        new Date(2026, 6, 12, 10, 0),
      ),
    ];

    const groups = groupEntriesByDay(entries, now);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.isToday).toBe(true);
    expect(groups[0]!.entries.map((e) => e.id)).toEqual(["today"]);
  });

  it("S16: 実績ゼロ件なら空配列を返す", () => {
    expect(groupEntriesByDay([], now)).toEqual([]);
  });
});
