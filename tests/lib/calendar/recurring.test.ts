import { describe, expect, it } from "vitest";
import {
  expandOccurrences,
  validateRecurringRuleInput,
  type RecurringRuleFormInput,
  type RecurringRuleInput,
} from "@/lib/calendar/recurring";

// 仕様書: docs/specs/P5-1_定期予定.md S1〜S7

const JST_DAILY: RecurringRuleInput = {
  pattern: "daily",
  weekdays: null,
  startTime: "09:00",
  endTime: "10:00",
  timezone: "Asia/Tokyo",
  startsOn: "2026-07-01",
  endsOn: null,
};

describe("expandOccurrences(S1)", () => {
  it("S1: dailyルールで範囲内の毎日、JST 9:00-10:00に対応するUTC時刻が返る", () => {
    const rangeStart = new Date("2026-07-06T00:00:00.000Z"); // 2026-07-06 09:00 JST
    const rangeEnd = new Date("2026-07-13T00:00:00.000Z"); // 2026-07-13 09:00 JST

    const occurrences = expandOccurrences(JST_DAILY, rangeStart, rangeEnd);

    expect(occurrences).toHaveLength(7);
    expect(occurrences[0]).toEqual({
      occurrenceDate: "2026-07-06",
      startAt: "2026-07-06T00:00:00.000Z",
      endAt: "2026-07-06T01:00:00.000Z",
    });
    expect(occurrences[6]).toEqual({
      occurrenceDate: "2026-07-12",
      startAt: "2026-07-12T00:00:00.000Z",
      endAt: "2026-07-12T01:00:00.000Z",
    });
  });
});

describe("expandOccurrences(S2)", () => {
  it("S2: weekly(月・水)ルールと2週間の範囲で月・水のみ4件返る", () => {
    const rule: RecurringRuleInput = {
      pattern: "weekly",
      weekdays: [1, 3], // 月・水
      startTime: "09:00",
      endTime: "10:00",
      timezone: "Asia/Tokyo",
      startsOn: "2026-07-01",
      endsOn: null,
    };
    // 2026-07-06(月)〜2026-07-19(日)の2週間
    const rangeStart = new Date("2026-07-05T15:00:00.000Z"); // 07-06 00:00 JST
    const rangeEnd = new Date("2026-07-19T15:00:00.000Z"); // 07-20 00:00 JST

    const occurrences = expandOccurrences(rule, rangeStart, rangeEnd);

    expect(occurrences.map((o) => o.occurrenceDate)).toEqual([
      "2026-07-06",
      "2026-07-08",
      "2026-07-13",
      "2026-07-15",
    ]);
  });
});

describe("expandOccurrences(S3)", () => {
  it("S3: weekdays(平日)ルールで月〜金の5件のみ返り、土日は含まれない", () => {
    const rule: RecurringRuleInput = {
      ...JST_DAILY,
      pattern: "weekdays",
      weekdays: null,
    };
    // 2026-07-06(月)〜2026-07-12(日)
    const rangeStart = new Date("2026-07-05T15:00:00.000Z");
    const rangeEnd = new Date("2026-07-12T15:00:00.000Z");

    const occurrences = expandOccurrences(rule, rangeStart, rangeEnd);

    expect(occurrences.map((o) => o.occurrenceDate)).toEqual([
      "2026-07-06",
      "2026-07-07",
      "2026-07-08",
      "2026-07-09",
      "2026-07-10",
    ]);
  });
});

describe("expandOccurrences(S4)", () => {
  it("S4: starts_on/ends_onの前後は含まれず、当日は含まれる", () => {
    const rule: RecurringRuleInput = {
      ...JST_DAILY,
      startsOn: "2026-07-08",
      endsOn: "2026-07-10",
    };
    const rangeStart = new Date("2026-07-05T00:00:00.000Z");
    const rangeEnd = new Date("2026-07-14T00:00:00.000Z");

    const occurrences = expandOccurrences(rule, rangeStart, rangeEnd);

    expect(occurrences.map((o) => o.occurrenceDate)).toEqual([
      "2026-07-08",
      "2026-07-09",
      "2026-07-10",
    ]);
  });
});

describe("expandOccurrences(S5)", () => {
  it("S5: 範囲境界をまたぐ発生は重なり判定に従って含まれる", () => {
    // 範囲終端ちょうどに開始する発生は含まれない(startAt < rangeEnd が偽になる)
    const rangeEnd = new Date("2026-07-06T00:00:00.000Z"); // 07-06 09:00 JST
    const occurrencesAtBoundary = expandOccurrences(
      JST_DAILY,
      new Date("2026-07-05T00:00:00.000Z"),
      rangeEnd,
    );
    expect(
      occurrencesAtBoundary.some((o) => o.occurrenceDate === "2026-07-06"),
    ).toBe(false);

    // 範囲始端ちょうどに終了する発生は含まれない(endAt > rangeStart が偽になる)
    const rangeStart = new Date("2026-07-06T01:00:00.000Z"); // 07-06 10:00 JST(終了時刻と一致)
    const occurrencesAtStart = expandOccurrences(
      JST_DAILY,
      rangeStart,
      new Date("2026-07-07T00:00:00.000Z"),
    );
    expect(
      occurrencesAtStart.some((o) => o.occurrenceDate === "2026-07-06"),
    ).toBe(false);

    // 範囲終端の1ms前に開始する発生は含まれる
    const occurrencesJustInside = expandOccurrences(
      JST_DAILY,
      new Date("2026-07-05T00:00:00.000Z"),
      new Date("2026-07-06T00:00:00.001Z"),
    );
    expect(
      occurrencesJustInside.some((o) => o.occurrenceDate === "2026-07-06"),
    ).toBe(true);
  });
});

describe("expandOccurrences(S6)", () => {
  it("S6: exceptionsに含まれる発生日はスキップされる(除外関数)", () => {
    const rangeStart = new Date("2026-07-06T00:00:00.000Z");
    const rangeEnd = new Date("2026-07-09T00:00:00.000Z");
    const occurrences = expandOccurrences(JST_DAILY, rangeStart, rangeEnd);
    const exceptions = new Set(["2026-07-07"]);

    const filtered = occurrences.filter(
      (o) => !exceptions.has(o.occurrenceDate),
    );

    expect(filtered.map((o) => o.occurrenceDate)).toEqual([
      "2026-07-06",
      "2026-07-08",
    ]);
  });
});

describe("expandOccurrences(S7)", () => {
  it("S7: ends_onが範囲開始より前(期限切れ)なら0件", () => {
    const rule: RecurringRuleInput = {
      ...JST_DAILY,
      startsOn: "2026-06-01",
      endsOn: "2026-06-30",
    };
    const rangeStart = new Date("2026-07-06T00:00:00.000Z");
    const rangeEnd = new Date("2026-07-13T00:00:00.000Z");

    const occurrences = expandOccurrences(rule, rangeStart, rangeEnd);

    expect(occurrences).toHaveLength(0);
  });
});

// 仕様書: docs/specs/P5-1_定期予定.md S8〜S10
// createRecurringRule等が使うサーバー側バリデーションを直接検証する(DBを介さない単体テスト)

const VALID_WEEKLY_INPUT: RecurringRuleFormInput = {
  title: "朝会",
  pattern: "weekly",
  weekdays: [1, 3],
  startTime: "09:00",
  endTime: "09:30",
  timezone: "Asia/Tokyo",
  startsOn: "2026-07-01",
  endsOn: null,
};

describe("validateRecurringRuleInput(S8)", () => {
  it("S8: weeklyでweekdaysが空だと不合格", () => {
    expect(
      validateRecurringRuleInput({ ...VALID_WEEKLY_INPUT, weekdays: [] }),
    ).toBeNull();
  });

  it("S8: weeklyでweekdaysに範囲外の値(7)が含まれると不合格", () => {
    expect(
      validateRecurringRuleInput({
        ...VALID_WEEKLY_INPUT,
        weekdays: [1, 7],
      }),
    ).toBeNull();
  });

  it("S8: weeklyでweekdaysに重複があると不合格", () => {
    expect(
      validateRecurringRuleInput({
        ...VALID_WEEKLY_INPUT,
        weekdays: [1, 1],
      }),
    ).toBeNull();
  });
});

describe("validateRecurringRuleInput(S9)", () => {
  it("S9: startTime = endTime は不合格", () => {
    expect(
      validateRecurringRuleInput({
        ...VALID_WEEKLY_INPUT,
        startTime: "09:00",
        endTime: "09:00",
      }),
    ).toBeNull();
  });

  it("S9: endTime = startTime + 1分なら合格", () => {
    expect(
      validateRecurringRuleInput({
        ...VALID_WEEKLY_INPUT,
        startTime: "09:00",
        endTime: "09:01",
      }),
    ).not.toBeNull();
  });
});

describe("validateRecurringRuleInput(S10)", () => {
  it("S10: 不正なtimezone文字列は不合格", () => {
    expect(
      validateRecurringRuleInput({
        ...VALID_WEEKLY_INPUT,
        timezone: "Asia/Osaka",
      }),
    ).toBeNull();
  });

  it("S10(正常系): 妥当なIANAタイムゾーンは合格", () => {
    expect(
      validateRecurringRuleInput({
        ...VALID_WEEKLY_INPUT,
        timezone: "America/New_York",
      }),
    ).not.toBeNull();
  });
});
