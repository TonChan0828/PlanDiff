import { describe, expect, it } from "vitest";
import { TZDate } from "@date-fns/tz";
import {
  buildSummaryPath,
  resolveSummaryRange,
  shiftAnchorDate,
} from "@/lib/summary/range";

// 仕様書: docs/specs/P5-9_サマリーの任意期間表示.md S1〜S16

const NOW = new Date(2026, 7, 1, 13, 45); // 2026-08-01(土) 13:45 ローカル

describe("resolveSummaryRange", () => {
  it("S1: range=today・date省略なら今日の0時〜翌0時になる", () => {
    const resolved = resolveSummaryRange({ range: "today" }, NOW);
    expect(resolved.key).toBe("today");
    expect(resolved.range.start).toEqual(new Date(2026, 7, 1));
    expect(resolved.range.end).toEqual(new Date(2026, 7, 2));
    expect(resolved.dayCount).toBe(1);
    expect(resolved.error).toBeNull();
  });

  it("S2: range=today&date=2026-07-15 ならその日の0時〜翌0時になる", () => {
    const resolved = resolveSummaryRange(
      { range: "today", date: "2026-07-15" },
      NOW,
    );
    expect(resolved.range.start).toEqual(new Date(2026, 6, 15));
    expect(resolved.range.end).toEqual(new Date(2026, 6, 16));
    expect(resolved.dayCount).toBe(1);
  });

  it("S3: range=week は月曜始まりの7日間になる", () => {
    const resolved = resolveSummaryRange(
      { range: "week", date: "2026-07-15" }, // 水曜
      NOW,
    );
    expect(resolved.key).toBe("week");
    expect(resolved.range.start).toEqual(new Date(2026, 6, 13)); // 月曜
    expect(resolved.range.end).toEqual(new Date(2026, 6, 20));
    expect(resolved.dayCount).toBe(7);
  });

  it("S4: range=month は月初〜翌月初になる", () => {
    const resolved = resolveSummaryRange(
      { range: "month", date: "2026-07-15" },
      NOW,
    );
    expect(resolved.key).toBe("month");
    expect(resolved.range.start).toEqual(new Date(2026, 6, 1));
    expect(resolved.range.end).toEqual(new Date(2026, 7, 1));
    expect(resolved.dayCount).toBe(31);
  });

  it("S5: range=custom は終了日を含む期間になる", () => {
    const resolved = resolveSummaryRange(
      { range: "custom", from: "2026-07-01", to: "2026-07-31" },
      NOW,
    );
    expect(resolved.key).toBe("custom");
    expect(resolved.range.start).toEqual(new Date(2026, 6, 1));
    expect(resolved.range.end).toEqual(new Date(2026, 7, 1));
    expect(resolved.dayCount).toBe(31);
    expect(resolved.from).toEqual(new Date(2026, 6, 1));
    expect(resolved.to).toEqual(new Date(2026, 6, 31));
  });

  it("S6: 開始日と終了日が同じ custom は1日として扱う", () => {
    const resolved = resolveSummaryRange(
      { range: "custom", from: "2026-07-05", to: "2026-07-05" },
      NOW,
    );
    expect(resolved.dayCount).toBe(1);
    expect(resolved.range.start).toEqual(new Date(2026, 6, 5));
    expect(resolved.range.end).toEqual(new Date(2026, 6, 6));
  });

  it("S7: 不正な date は今日基準へフォールバックする", () => {
    const resolved = resolveSummaryRange(
      { range: "today", date: "2026-02-30" },
      NOW,
    );
    expect(resolved.range.start).toEqual(new Date(2026, 7, 1));
    expect(resolved.anchorDate).toEqual(new Date(2026, 7, 1));
  });

  it("S8: 未知の range は today として扱う", () => {
    const resolved = resolveSummaryRange({ range: "quarter" }, NOW);
    expect(resolved.key).toBe("today");
    expect(resolved.dayCount).toBe(1);
  });

  it("S9: from と to が逆転した custom は today へフォールバックする", () => {
    const resolved = resolveSummaryRange(
      { range: "custom", from: "2026-07-31", to: "2026-07-01" },
      NOW,
    );
    expect(resolved.key).toBe("today");
    expect(resolved.range.start).toEqual(new Date(2026, 7, 1));
  });

  it("S10: from/to が欠落した custom は today へフォールバックする", () => {
    expect(resolveSummaryRange({ range: "custom" }, NOW).key).toBe("today");
    expect(
      resolveSummaryRange({ range: "custom", from: "2026-07-01" }, NOW).key,
    ).toBe("today");
    expect(
      resolveSummaryRange({ range: "custom", to: "2026-07-01" }, NOW).key,
    ).toBe("today");
  });

  it("S11: ちょうど366日の custom は許容する(境界値)", () => {
    // 2026-01-01 〜 2026-12-31 = 365日。366日にするため翌年1/1まで
    const resolved = resolveSummaryRange(
      { range: "custom", from: "2026-01-01", to: "2027-01-01" },
      NOW,
    );
    expect(resolved.dayCount).toBe(366);
    expect(resolved.error).toBeNull();
    expect(resolved.key).toBe("custom");
  });

  it("S12: 367日の custom は error=too-long になる(境界値)", () => {
    const resolved = resolveSummaryRange(
      { range: "custom", from: "2026-01-01", to: "2027-01-02" },
      NOW,
    );
    expect(resolved.dayCount).toBe(367);
    expect(resolved.error).toBe("too-long");
    expect(resolved.key).toBe("custom");
  });
});

// 仕様書: docs/specs/P8-3_サマリーの日付またぎとTZ非対称の是正.md S9〜S11
describe("resolveSummaryRange のTZ対応(S9〜S11)", () => {
  // 2026-08-11T12:00:00Z: 東京(UTC+9)では8/11 21:00、UTC+14では8/12 02:00と
  // 暦日が割れる瞬間(ホストのローカルTZに依存しない絶対時刻)
  const INSTANT = new Date(Date.UTC(2026, 7, 11, 12, 0, 0));

  it("S9: nowがTZDateならそのタイムゾーンの今日0時〜翌0時になる", () => {
    const now = new TZDate(INSTANT, "Pacific/Kiritimati");
    const resolved = resolveSummaryRange({ range: "today" }, now);

    // Pacific/Kiritimati(UTC+14)での8/12 00:00 は UTC の 8/11 10:00
    expect(resolved.range.start.getTime()).toBe(
      Date.UTC(2026, 7, 11, 10, 0, 0),
    );
    expect(resolved.range.end.getTime()).toBe(Date.UTC(2026, 7, 12, 10, 0, 0));
  });

  it("S10: nowがTZDateのとき明示的なdateもそのタイムゾーンの0時境界で解釈される", () => {
    const now = new TZDate(INSTANT, "Pacific/Kiritimati");
    const resolved = resolveSummaryRange(
      { range: "today", date: "2026-08-01" },
      now,
    );

    expect(resolved.range.start.getTime()).toBe(
      Date.UTC(2026, 6, 31, 10, 0, 0),
    );
    expect(resolved.range.end.getTime()).toBe(Date.UTC(2026, 7, 1, 10, 0, 0));
  });

  it("S11: nowが通常のDateなら既存どおりserver-local基準になる(回帰確認)", () => {
    const resolved = resolveSummaryRange({ range: "today" }, NOW);
    expect(resolved.range.start).toEqual(new Date(2026, 7, 1));
    expect(resolved.range.end).toEqual(new Date(2026, 7, 2));
  });
});

describe("shiftAnchorDate", () => {
  it("S13: today は前後1日ずつ移動する", () => {
    const anchor = new Date(2026, 7, 1);
    expect(shiftAnchorDate("today", anchor, "prev")).toEqual(
      new Date(2026, 6, 31),
    );
    expect(shiftAnchorDate("today", anchor, "next")).toEqual(
      new Date(2026, 7, 2),
    );
  });

  it("S14: week は前後7日ずつ移動する", () => {
    const anchor = new Date(2026, 7, 1);
    expect(shiftAnchorDate("week", anchor, "prev")).toEqual(
      new Date(2026, 6, 25),
    );
    expect(shiftAnchorDate("week", anchor, "next")).toEqual(
      new Date(2026, 7, 8),
    );
  });

  it("S15: month は月末から前月へ移動しても繰り上がらない(境界値)", () => {
    const anchor = new Date(2026, 2, 31); // 2026-03-31
    expect(shiftAnchorDate("month", anchor, "prev")).toEqual(
      new Date(2026, 1, 28), // 2026-02-28
    );
    expect(shiftAnchorDate("month", anchor, "next")).toEqual(
      new Date(2026, 3, 30), // 2026-04-30
    );
  });
});

describe("buildSummaryPath", () => {
  it("S16: key ごとに正しいクエリを組み立てる", () => {
    expect(
      buildSummaryPath("today", { anchorDate: new Date(2026, 7, 1) }),
    ).toBe("/summary?range=today&date=2026-08-01");
    expect(
      buildSummaryPath("week", { anchorDate: new Date(2026, 6, 15) }),
    ).toBe("/summary?range=week&date=2026-07-15");
    expect(
      buildSummaryPath("month", { anchorDate: new Date(2026, 6, 15) }),
    ).toBe("/summary?range=month&date=2026-07-15");
    expect(
      buildSummaryPath("custom", {
        from: new Date(2026, 6, 1),
        to: new Date(2026, 6, 31),
      }),
    ).toBe("/summary?range=custom&from=2026-07-01&to=2026-07-31");
  });
});
