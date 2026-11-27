import { describe, expect, it } from "vitest";
import { layoutDayEvents } from "@/lib/calendar/layout";
import { capLongEntries } from "@/lib/calendar/long-entry";

// 仕様書: docs/specs/G-104_週表示の長時間実績の省略表示.md J1〜J3
// 日時はローカルTZで組み立てる(R-1)

const at = (hour: number, minute = 0, day = 7) =>
  new Date(2026, 6, day, hour, minute).toISOString();
const DAY = new Date(2026, 6, 7);
const NEXT_DAY = new Date(2026, 6, 8);

const entry = (
  id: string,
  startAt: string,
  endAt: string,
  editable = true,
) => ({ id, title: id, startAt, endAt, editable });

describe("capLongEntries(G-104)", () => {
  it("J1: 7時間59分は省略せず、8時間ちょうどは開始から2時間ぶんに省略する。元の時刻は変えない", () => {
    const [short] = capLongEntries([entry("a", at(6), at(13, 59))], DAY);
    const [long] = capLongEntries([entry("a", at(6), at(14))], DAY);

    expect(short).toEqual(entry("a", at(6), at(13, 59)));
    expect(long).toEqual({
      ...entry("a", at(6), at(14)),
      layoutEndAt: at(8),
      longEntry: "head",
    });
  });

  it("J1: 実行中(編集できない)の実績は省略しない", () => {
    const running = entry("r", at(0), at(20), false);

    expect(capLongEntries([running], DAY)).toEqual([running]);
  });

  it("J2: 日をまたぐと、開始日は2時間ぶん、続きの日は0時の印になる", () => {
    const overnight = entry("n", at(20), at(9, 0, 8));

    expect(capLongEntries([overnight], DAY)[0]).toMatchObject({
      longEntry: "head",
      layoutEndAt: at(22),
    });
    expect(capLongEntries([overnight], NEXT_DAY)[0]).toMatchObject({
      longEntry: "continuation",
      layoutStartAt: at(0, 0, 8),
      layoutEndAt: at(0, 0, 8),
      startAt: at(20),
    });
  });

  it("J2(境界): 省略後の2時間が0時をまたぐ場合は、両方の日が先頭の表示になる", () => {
    const overnight = entry("n", at(23), at(8, 0, 8));

    expect(capLongEntries([overnight], DAY)[0]!.longEntry).toBe("head");
    expect(capLongEntries([overnight], NEXT_DAY)[0]).toMatchObject({
      longEntry: "head",
      layoutEndAt: at(1, 0, 8),
    });
  });

  it("J3: 列の割り当ては省略後の範囲で行い、後半の時間帯の実績は全幅になる", () => {
    const inputs = [
      entry("long", at(6), at(18, 38)),
      entry("later", at(12), at(13)),
    ];

    const raw = layoutDayEvents(inputs, DAY);
    const capped = layoutDayEvents(capLongEntries(inputs, DAY), DAY);

    expect(raw.find((b) => b.id === "later")!.columnCount).toBe(2);
    expect(capped.find((b) => b.id === "later")!.columnCount).toBe(1);
    const long = capped.find((b) => b.id === "long")!;
    expect(long.heightPercent).toBeCloseTo((120 / 1440) * 100);
    expect(long.endAt).toBe(at(18, 38));
    expect(long.clippedEnd).toBe(false);
  });
});
