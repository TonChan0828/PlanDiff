import { describe, expect, it } from "vitest";
import { filterTodayEntries } from "@/lib/track/today-entries";
import type { TimeEntryItem } from "@/lib/timer/types";

// 仕様書: docs/specs/P2-6_計測画面.md S3
// 「今日」の判定はユーザー(実行環境)のローカルTZで行う

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

describe("filterTodayEntries", () => {
  it("S3: 昨日・今日・明日の実績のうち、今日開始した実績のみが開始降順で返る", () => {
    const entries = [
      entry(
        "yesterday",
        "昨日の作業",
        new Date(2026, 6, 10, 10, 0),
        new Date(2026, 6, 10, 11, 0),
      ),
      entry(
        "today-morning",
        "朝の作業",
        new Date(2026, 6, 11, 9, 0),
        new Date(2026, 6, 11, 9, 30),
      ),
      entry(
        "today-evening",
        "夜の作業",
        new Date(2026, 6, 11, 20, 0),
        new Date(2026, 6, 11, 21, 0),
      ),
      entry(
        "tomorrow",
        "明日の作業",
        new Date(2026, 6, 12, 10, 0),
        new Date(2026, 6, 12, 11, 0),
      ),
    ];

    const filtered = filterTodayEntries(entries, now);

    expect(filtered.map((e) => e.id)).toEqual([
      "today-evening",
      "today-morning",
    ]);
  });

  it("S3補: 今日の実績がなければ空配列を返す", () => {
    const entries = [
      entry(
        "yesterday",
        "昨日の作業",
        new Date(2026, 6, 10, 10, 0),
        new Date(2026, 6, 10, 11, 0),
      ),
    ];

    expect(filterTodayEntries(entries, now)).toEqual([]);
  });
});
