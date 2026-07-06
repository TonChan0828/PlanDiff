import { describe, expect, it } from "vitest";
import {
  layoutDayEvents,
  MIN_BLOCK_MINUTES,
  type CalendarBlockInput,
} from "@/lib/calendar/layout";

// 仕様書: docs/specs/P2-1_カレンダービュー.md S1〜S4
// 入力はUTCのISO文字列(DB保存形式)、配置は端末ローカルTZの日に対して計算する

const DAY = new Date(2026, 6, 7); // 2026-07-07(ローカルTZ)

function event(
  id: string,
  start: [number, number],
  end: [number, number],
  dayOffsetEnd = 0,
): CalendarBlockInput {
  return {
    id,
    title: `予定${id}`,
    startAt: new Date(2026, 6, 7, start[0], start[1]).toISOString(),
    endAt: new Date(2026, 6, 7 + dayOffsetEnd, end[0], end[1]).toISOString(),
  };
}

describe("layoutDayEvents", () => {
  it("S1: 09:00〜10:30 の予定は top=37.5% / height=6.25% に配置される", () => {
    const [block] = layoutDayEvents([event("a", [9, 0], [10, 30])], DAY);
    expect(block).toBeDefined();
    expect(block!.topPercent).toBeCloseTo((9 / 24) * 100);
    expect(block!.heightPercent).toBeCloseTo((1.5 / 24) * 100);
    expect(block!.column).toBe(0);
    expect(block!.columnCount).toBe(1);
    expect(block!.clippedStart).toBe(false);
    expect(block!.clippedEnd).toBe(false);
  });

  it("S2: 日跨ぎ予定(23:00〜翌01:00)は日ごとにクリップされる", () => {
    const crossing = [event("a", [23, 0], [1, 0], 1)];

    // 当日: 23:00〜24:00
    const [today] = layoutDayEvents(crossing, DAY);
    expect(today).toBeDefined();
    expect(today!.topPercent).toBeCloseTo((23 / 24) * 100);
    expect(today!.heightPercent).toBeCloseTo((1 / 24) * 100);
    expect(today!.clippedEnd).toBe(true);

    // 翌日: 00:00〜01:00
    const [nextDay] = layoutDayEvents(crossing, new Date(2026, 6, 8));
    expect(nextDay).toBeDefined();
    expect(nextDay!.topPercent).toBeCloseTo(0);
    expect(nextDay!.heightPercent).toBeCloseTo((1 / 24) * 100);
    expect(nextDay!.clippedStart).toBe(true);

    // 交差しない日には含まれない
    expect(layoutDayEvents(crossing, new Date(2026, 6, 9))).toHaveLength(0);
  });

  it("S3: 重複する2件はレーン内で2等分される", () => {
    const blocks = layoutDayEvents(
      [event("a", [9, 0], [10, 0]), event("b", [9, 30], [10, 30])],
      DAY,
    );
    expect(blocks).toHaveLength(2);
    expect(blocks.every((b) => b.columnCount === 2)).toBe(true);
    expect(new Set(blocks.map((b) => b.column))).toEqual(new Set([0, 1]));
  });

  it("S3: 重複する3件はレーン内で3等分される", () => {
    const blocks = layoutDayEvents(
      [
        event("a", [9, 0], [10, 0]),
        event("b", [9, 15], [10, 15]),
        event("c", [9, 30], [10, 30]),
      ],
      DAY,
    );
    expect(blocks).toHaveLength(3);
    expect(blocks.every((b) => b.columnCount === 3)).toBe(true);
    expect(new Set(blocks.map((b) => b.column))).toEqual(new Set([0, 1, 2]));
  });

  it("S4: 極短予定・開始=終了の予定にも最小高さが確保される", () => {
    const minHeight = (MIN_BLOCK_MINUTES / (24 * 60)) * 100;

    const [short] = layoutDayEvents([event("a", [10, 0], [10, 5])], DAY);
    expect(short).toBeDefined();
    expect(short!.heightPercent).toBeCloseTo(minHeight);

    const [zero] = layoutDayEvents([event("b", [10, 0], [10, 0])], DAY);
    expect(zero).toBeDefined();
    expect(zero!.heightPercent).toBeCloseTo(minHeight);
    expect(zero!.heightPercent).toBeGreaterThan(0);
  });
});
