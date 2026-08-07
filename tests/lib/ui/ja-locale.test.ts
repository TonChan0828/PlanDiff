import { describe, expect, it } from "vitest";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { jaMinimal } from "@/lib/ui/ja-locale";

// 仕様書: docs/specs/P6-3_クライアントバンドルとレンダリング.md S1〜S4
// 最小localeの出力が date-fns/locale の ja と1文字も違わないことを固定する。

/** アプリ内で実際に使っている書式(仕様書の洗い出し結果) */
const USED_PATTERNS = [
  "E",
  "M/d(E)",
  "M月d日(E)",
  "yyyy年M月d日(E)",
  "yyyy年M月d日",
  "M月d日",
  "yyyy年M月",
  "HH:mm",
  "d",
  "yyyy-MM-dd",
] as const;

describe("最小localeの曜日(S1)", () => {
  it("S1: E は 日,月,火,水,木,金,土 を返し、ja と一致する", () => {
    // 2026-08-02 は日曜
    const sunday = new Date(2026, 7, 2);
    const actual: string[] = [];
    const expected: string[] = [];
    for (let i = 0; i < 7; i += 1) {
      const day = new Date(2026, 7, 2 + i);
      actual.push(format(day, "E", { locale: jaMinimal }));
      expected.push(format(day, "E", { locale: ja }));
    }

    expect(actual).toEqual(["日", "月", "火", "水", "木", "金", "土"]);
    expect(actual).toEqual(expected);
    expect(format(sunday, "E", { locale: jaMinimal })).toBe("日");
  });
});

describe("使用中の全書式が ja と一致する(S2・S3)", () => {
  it.each(USED_PATTERNS)("S2: %s が1週間ぶんで ja と一致する", (pattern) => {
    for (let i = 0; i < 7; i += 1) {
      const day = new Date(2026, 7, 3 + i, 13, 45);
      expect(format(day, pattern, { locale: jaMinimal })).toBe(
        format(day, pattern, { locale: ja }),
      );
    }
  });

  it.each(USED_PATTERNS)("S3: %s が境界日でも ja と一致する", (pattern) => {
    const boundaries = [
      new Date(2026, 0, 1, 0, 0), // 年始
      new Date(2026, 11, 31, 23, 59), // 年末
      new Date(2026, 1, 28, 12, 0), // 月末(平年)
      new Date(2024, 1, 29, 12, 0), // うるう日
      new Date(2026, 2, 1, 0, 0), // 月初
    ];
    for (const day of boundaries) {
      expect(format(day, pattern, { locale: jaMinimal })).toBe(
        format(day, pattern, { locale: ja }),
      );
    }
  });
});

describe("未実装の呼び出しは明示的に失敗する(S4)", () => {
  it("S4: wide の曜日を要求すると例外を投げる", () => {
    expect(() => jaMinimal.localize.day(0, { width: "wide" })).toThrowError(
      /未実装/,
    );
  });

  it("S4: 未実装の localize / formatLong は例外を投げる", () => {
    expect(() => jaMinimal.localize.month(0)).toThrowError(/未実装/);
    expect(() => jaMinimal.localize.dayPeriod("am")).toThrowError(/未実装/);
    expect(() => jaMinimal.formatLong.date({ width: "full" })).toThrowError(
      /未実装/,
    );
  });

  it("S4: 未実装のトークンを含む書式は例外になる(黙って英語表記にならない)", () => {
    // "MMMM"(月名)や "PPP" は localize.month / formatLong.date を要求する
    const day = new Date(2026, 7, 3);
    expect(() => format(day, "MMMM", { locale: jaMinimal })).toThrowError(
      /未実装/,
    );
    expect(() => format(day, "PPP", { locale: jaMinimal })).toThrowError(
      /未実装/,
    );
  });
});
