import { describe, expect, it } from "vitest";
import {
  selectQuickStartEvents,
  type QuickStartEvent,
} from "@/lib/track/quick-start";

// 仕様書: docs/specs/P2-6_計測画面.md S1 / S2

// テスト実行環境のTZに依存しないよう、ローカル時刻からISOを組み立てる
const now = new Date(2026, 6, 11, 10, 0, 0, 0); // 2026-07-11 10:00(ローカル)

function isoAt(hour: number, minute = 0, dayOffset = 0): string {
  return new Date(2026, 6, 11 + dayOffset, hour, minute, 0, 0).toISOString();
}

function event(
  id: string,
  title: string,
  startAt: string,
  endAt: string,
): QuickStartEvent {
  return { id, googleEventId: `g-${id}`, title, startAt, endAt };
}

describe("selectQuickStartEvents", () => {
  it("S1: 進行中の予定が先頭、以降は開始が近い未来順で合計3件(過去の予定は含まない)", () => {
    const events = [
      event("past", "終わった会議", isoAt(8, 0), isoAt(9, 0)),
      event("future3", "夕会", isoAt(17, 0), isoAt(17, 30)),
      event("ongoing", "設計レビュー", isoAt(9, 30), isoAt(10, 30)),
      event("future1", "実装", isoAt(11, 0), isoAt(12, 0)),
      event("future2", "リリース作業", isoAt(14, 0), isoAt(15, 0)),
    ];

    const selected = selectQuickStartEvents(events, now);

    expect(selected.map((e) => e.id)).toEqual([
      "ongoing",
      "future1",
      "future2",
    ]);
  });

  it("S2: 開始時刻がちょうど現在の予定は進行中として含み、終了時刻がちょうど現在の予定は含まない(境界値)", () => {
    const events = [
      event("ends-now", "終了ちょうど", isoAt(9, 0), isoAt(10, 0)),
      event("starts-now", "開始ちょうど", isoAt(10, 0), isoAt(11, 0)),
    ];

    const selected = selectQuickStartEvents(events, now);

    expect(selected.map((e) => e.id)).toEqual(["starts-now"]);
  });

  it("S2補: 翌日の予定は「直近」に含まない(当日内のみ)", () => {
    const events = [
      event("tomorrow", "明日の朝会", isoAt(10, 30, 1), isoAt(11, 0, 1)),
      event("today", "今日の実装", isoAt(11, 0), isoAt(12, 0)),
    ];

    const selected = selectQuickStartEvents(events, now);

    expect(selected.map((e) => e.id)).toEqual(["today"]);
  });
});
