import { describe, expect, it } from "vitest";
import {
  parseLocalDateTime,
  setLocalDate,
  setLocalHour,
  setLocalMinute,
  setLocalSegment,
  stepLocalHour,
  stepLocalMinute,
  stepLocalSegment,
} from "@/lib/ui/local-date-time";

// 仕様: docs/specs/P5-5_時刻ステッパー入力.md #テストシナリオ

describe("stepLocalMinute", () => {
  it("S1: 通常の-1(境界値でない)", () => {
    expect(stepLocalMinute("2026-07-20T10:30", -1)).toBe("2026-07-20T10:29");
  });

  it("S2: 00分で-1すると時も-1する(本要望の中心シナリオ)", () => {
    expect(stepLocalMinute("2026-07-20T10:00", -1)).toBe("2026-07-20T09:59");
  });

  it("S3: 59分で+1すると時も+1する", () => {
    expect(stepLocalMinute("2026-07-20T10:59", 1)).toBe("2026-07-20T11:00");
  });

  it("S4: 日付跨ぎ(00:00で-1すると前日23:59)", () => {
    expect(stepLocalMinute("2026-07-08T00:00", -1)).toBe("2026-07-07T23:59");
  });

  it("S5: 月末跨ぎ", () => {
    expect(stepLocalMinute("2026-08-01T00:00", -1)).toBe("2026-07-31T23:59");
  });

  it("S6: 年跨ぎ", () => {
    expect(stepLocalMinute("2027-01-01T00:00", -1)).toBe("2026-12-31T23:59");
  });

  it("S7: うるう年", () => {
    expect(stepLocalMinute("2028-03-01T00:00", -1)).toBe("2028-02-29T23:59");
  });

  it("S12: 空文字列は空文字列のまま(未入力)", () => {
    expect(stepLocalMinute("", -1)).toBe("");
  });

  it("S13: 不正な形式は元の文字列のまま", () => {
    expect(stepLocalMinute("invalid", -1)).toBe("invalid");
  });
});

describe("stepLocalHour", () => {
  it("S8: 00時で-1すると日付も-1する", () => {
    expect(stepLocalHour("2026-07-20T00:00", -1)).toBe("2026-07-19T23:00");
  });

  it("S9: 23時で+1すると日付も+1する", () => {
    expect(stepLocalHour("2026-07-20T23:00", 1)).toBe("2026-07-21T00:00");
  });

  it("S12: 空文字列は空文字列のまま(未入力)", () => {
    expect(stepLocalHour("", 1)).toBe("");
  });

  it("S13: 不正な形式は元の文字列のまま", () => {
    expect(stepLocalHour("invalid", 1)).toBe("invalid");
  });
});

describe("setLocalHour", () => {
  it("S10: 上限クランプ(桁は跨がない=分は変化しない)", () => {
    expect(setLocalHour("2026-07-20T10:30", 99)).toBe("2026-07-20T23:30");
  });

  it("下限クランプ", () => {
    expect(setLocalHour("2026-07-20T10:30", -5)).toBe("2026-07-20T00:30");
  });

  it("S12: 空文字列は空文字列のまま(未入力)", () => {
    expect(setLocalHour("", 5)).toBe("");
  });
});

describe("setLocalMinute", () => {
  it("S11: 下限クランプ", () => {
    expect(setLocalMinute("2026-07-20T10:30", -5)).toBe("2026-07-20T10:00");
  });

  it("上限クランプ", () => {
    expect(setLocalMinute("2026-07-20T10:30", 99)).toBe("2026-07-20T10:59");
  });

  it("S12: 空文字列は空文字列のまま(未入力)", () => {
    expect(setLocalMinute("", 5)).toBe("");
  });
});

describe("setLocalDate", () => {
  it("日付部分のみ置換する", () => {
    expect(setLocalDate("2026-07-20T10:30", "2026-08-01")).toBe(
      "2026-08-01T10:30",
    );
  });

  it("S14: 空文字列を渡すと全体が未入力になる", () => {
    expect(setLocalDate("2026-07-20T10:30", "")).toBe("");
  });
});

describe("parseLocalDateTime", () => {
  it("正しく分解できる", () => {
    expect(parseLocalDateTime("2026-07-20T10:30")).toEqual({
      date: "2026-07-20",
      hour: 10,
      minute: 30,
    });
  });

  it("S13: 不正な形式はnullを返す", () => {
    expect(parseLocalDateTime("invalid")).toBeNull();
  });

  it("S12: 空文字列はnullを返す", () => {
    expect(parseLocalDateTime("")).toBeNull();
  });
});

// 仕様: docs/specs/P5-6_日時セグメント編集.md #テストシナリオ(純関数 S1〜S12)

describe("stepLocalSegment (P5-6)", () => {
  it("S1: 分59を+1すると時も+1する(桁跨ぎ)", () => {
    expect(stepLocalSegment("2026-07-20T10:59", "minute", 1)).toBe(
      "2026-07-20T11:00",
    );
  });

  it("S2: 分00を-1すると時も-1する", () => {
    expect(stepLocalSegment("2026-07-20T10:00", "minute", -1)).toBe(
      "2026-07-20T09:59",
    );
  });

  it("S3: 日を+1すると月も跨ぐ(7/31→8/1)", () => {
    expect(stepLocalSegment("2026-07-31T10:00", "day", 1)).toBe(
      "2026-08-01T10:00",
    );
  });

  it("S4: 日を-1すると前月末に戻る(8/1→7/31)", () => {
    expect(stepLocalSegment("2026-08-01T10:00", "day", -1)).toBe(
      "2026-07-31T10:00",
    );
  });

  it("S5: 月を+1すると年も跨ぐ(12月→翌1月)", () => {
    expect(stepLocalSegment("2026-12-15T10:00", "month", 1)).toBe(
      "2027-01-15T10:00",
    );
  });

  it("S6: うるう年の2/28を+1すると2/29(境界値)", () => {
    expect(stepLocalSegment("2028-02-28T10:00", "day", 1)).toBe(
      "2028-02-29T10:00",
    );
  });

  it("S7: 年を+1すると年のみ変化する", () => {
    expect(stepLocalSegment("2026-07-20T10:00", "year", 1)).toBe(
      "2027-07-20T10:00",
    );
  });

  it("S12: 空・不正な値はそのまま返す(異常系)", () => {
    expect(stepLocalSegment("", "minute", 1)).toBe("");
    expect(stepLocalSegment("invalid", "day", -1)).toBe("invalid");
  });
});

describe("setLocalSegment (P5-6)", () => {
  it("S8: 月を2に変更すると日を月末クランプする(3/31→2/28)", () => {
    expect(setLocalSegment("2026-03-31T10:00", "month", 2)).toBe(
      "2026-02-28T10:00",
    );
  });

  it("S9: 時の上限クランプ(25→23、分は不変)", () => {
    expect(setLocalSegment("2026-07-20T10:30", "hour", 25)).toBe(
      "2026-07-20T23:30",
    );
  });

  it("S10: 分の上限クランプ(70→59)", () => {
    expect(setLocalSegment("2026-07-20T10:30", "minute", 70)).toBe(
      "2026-07-20T10:59",
    );
  });

  it("S11: 日の上限はその月の末日(7月に31→31, 過剰はクランプ)", () => {
    expect(setLocalSegment("2026-07-20T10:30", "day", 31)).toBe(
      "2026-07-31T10:30",
    );
    expect(setLocalSegment("2026-02-10T10:30", "day", 31)).toBe(
      "2026-02-28T10:30",
    );
  });

  it("S12: 空・不正な値はそのまま返す(異常系)", () => {
    expect(setLocalSegment("", "hour", 5)).toBe("");
    expect(setLocalSegment("invalid", "minute", 5)).toBe("invalid");
  });
});
