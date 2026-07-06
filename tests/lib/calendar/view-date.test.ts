import { describe, expect, it } from "vitest";
import { startOfDay } from "date-fns";
import {
  buildCalendarPath,
  parseViewState,
  shiftDate,
  toDateParam,
  weekDaysOf,
} from "@/lib/calendar/view-date";

// 仕様書: docs/specs/P2-1_カレンダービュー.md S5 / S6

const TODAY = new Date(2026, 6, 8, 15, 30); // 2026-07-08(水)15:30

describe("weekDaysOf / shiftDate(S5)", () => {
  it("S5: 任意の日付から月曜始まりの7日が返る", () => {
    const days = weekDaysOf(new Date(2026, 6, 8));
    expect(days).toHaveLength(7);
    expect(toDateParam(days[0]!)).toBe("2026-07-06"); // 月
    expect(toDateParam(days[6]!)).toBe("2026-07-12"); // 日
  });

  it("S5: 日ビューのナビゲーション先は±1日", () => {
    const base = new Date(2026, 6, 8);
    expect(toDateParam(shiftDate("day", base, "next"))).toBe("2026-07-09");
    expect(toDateParam(shiftDate("day", base, "prev"))).toBe("2026-07-07");
  });

  it("S5: 週ビューのナビゲーション先は±7日", () => {
    const base = new Date(2026, 6, 8);
    expect(toDateParam(shiftDate("week", base, "next"))).toBe("2026-07-15");
    expect(toDateParam(shiftDate("week", base, "prev"))).toBe("2026-07-01");
  });

  it("S5: buildCalendarPath は view と date を含むURLを組み立てる", () => {
    expect(buildCalendarPath("week", new Date(2026, 6, 8))).toBe(
      "/calendar?view=week&date=2026-07-08",
    );
  });
});

describe("parseViewState(S6)", () => {
  it("S6: 省略時は日ビュー・今日にフォールバックする", () => {
    const state = parseViewState(undefined, undefined, TODAY);
    expect(state.view).toBe("day");
    expect(state.date).toEqual(startOfDay(TODAY));
  });

  it("S6: 正しいパラメータはそのまま解釈される", () => {
    const state = parseViewState("week", "2026-07-01", TODAY);
    expect(state.view).toBe("week");
    expect(toDateParam(state.date)).toBe("2026-07-01");
  });

  it("S6: 不正な view は日ビューへフォールバックする", () => {
    expect(parseViewState("month", "2026-07-01", TODAY).view).toBe("day");
  });

  it("S6: 不正な date は今日へフォールバックする", () => {
    for (const invalid of ["2026-13-99", "2026-02-30", "abc", "20260701"]) {
      const state = parseViewState("day", invalid, TODAY);
      expect(state.date).toEqual(startOfDay(TODAY));
    }
  });
});
