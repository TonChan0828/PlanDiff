import { describe, expect, it } from "vitest";
import { TZDate } from "@date-fns/tz";
import { startOfDay } from "date-fns";
import {
  buildCalendarPath,
  parseDateParam,
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
    expect(buildCalendarPath("week", new Date(2026, 6, 8), null)).toBe(
      "/calendar?view=week&date=2026-07-08",
    );
  });
});

// 仕様書: docs/specs/P8-1_日付またぎの自動反映.md S8〜S11
// 「URLのdateは今日以外を見ているときだけ持つ」不変条件
describe("buildCalendarPath と今日(S8〜S11)", () => {
  it("S8: 表示日が今日と同じ暦日なら date を含めない", () => {
    const today = new Date(2026, 7, 11, 15, 30);
    expect(buildCalendarPath("day", new Date(2026, 7, 11), today)).toBe(
      "/calendar?view=day",
    );
    expect(buildCalendarPath("week", new Date(2026, 7, 11), today)).toBe(
      "/calendar?view=week",
    );
  });

  it("S9: 表示日が今日と別の暦日なら date を含める", () => {
    const today = new Date(2026, 7, 11, 15, 30);
    expect(buildCalendarPath("day", new Date(2026, 7, 10), today)).toBe(
      "/calendar?view=day&date=2026-08-10",
    );
    expect(buildCalendarPath("day", new Date(2026, 7, 12), today)).toBe(
      "/calendar?view=day&date=2026-08-12",
    );
  });

  it("S10: today が null(ハイドレーション前)なら常に date を含める", () => {
    expect(buildCalendarPath("day", new Date(2026, 7, 11), null)).toBe(
      "/calendar?view=day&date=2026-08-11",
    );
  });

  it("S11: 同じ暦日なら時刻が違っても date を含めない(境界値)", () => {
    // 23:00 の「今日」と 00:00 の表示日。時刻差で別日と誤判定しないこと
    expect(
      buildCalendarPath(
        "day",
        new Date(2026, 7, 11, 0, 0),
        new Date(2026, 7, 11, 23, 0),
      ),
    ).toBe("/calendar?view=day");
    // 1分違いでも暦日が違えば date を含める
    expect(
      buildCalendarPath(
        "day",
        new Date(2026, 7, 11, 23, 59),
        new Date(2026, 7, 12, 0, 0),
      ),
    ).toBe("/calendar?view=day&date=2026-08-11");
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

// 仕様書: docs/specs/P8-3_サマリーの日付またぎとTZ非対称の是正.md S7〜S8
describe("parseDateParam の referenceZero 引数(S7〜S8)", () => {
  it("S7: 第2引数を省略すると既存どおりの解釈になる(回帰確認)", () => {
    expect(parseDateParam("2026-07-08")).toEqual(new Date(2026, 6, 8));
    expect(parseDateParam(undefined)).toBeNull();
    expect(parseDateParam("2026-02-30")).toBeNull();
  });

  it("S8: TZDateを渡すとそのタイムゾーンの暦日として解釈される", () => {
    const referenceZero = new TZDate(0, "Pacific/Kiritimati");
    const result = parseDateParam("2026-07-08", referenceZero);

    expect(result).toBeInstanceOf(TZDate);
    expect((result as TZDate).timeZone).toBe("Pacific/Kiritimati");
    expect([
      (result as TZDate).getFullYear(),
      (result as TZDate).getMonth(),
      (result as TZDate).getDate(),
    ]).toEqual([2026, 6, 8]);
  });
});
