import { describe, expect, it } from "vitest";
import {
  parseLocalDateTime,
  setLocalDate,
  setLocalHour,
  setLocalMinute,
  stepLocalHour,
  stepLocalMinute,
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
