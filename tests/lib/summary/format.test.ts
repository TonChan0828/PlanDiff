import { describe, expect, it } from "vitest";

import {
  formatClockMinutes,
  formatSignedClockMinutes,
  formatStartDelay,
} from "@/lib/summary/format";

// 仕様書: docs/specs/D-3_サマリーヒーローとLP.md S5(符号付きH:MMフォーマッタ)

describe("formatClockMinutes(S5)", () => {
  it("S5: 分数をH:MM形式にする", () => {
    expect(formatClockMinutes(245)).toBe("4:05");
    expect(formatClockMinutes(60)).toBe("1:00");
    expect(formatClockMinutes(5)).toBe("0:05");
    expect(formatClockMinutes(0)).toBe("0:00");
  });
});

describe("formatSignedClockMinutes(S5)", () => {
  it("S5: 正のズレは+付きになる", () => {
    expect(formatSignedClockMinutes(55)).toBe("+0:55");
  });

  it("S5: 負のズレは-付きになる", () => {
    expect(formatSignedClockMinutes(-70)).toBe("-1:10");
  });

  it("S5: ゼロは±0:00になる(境界値)", () => {
    expect(formatSignedClockMinutes(0)).toBe("±0:00");
  });
});

// 仕様書: docs/specs/P5-8_予定単位のズレと開始遅延.md S10
describe("formatStartDelay(P5-8 S10)", () => {
  it("P5-8 S10: 遅れ(正)は「着手 予定より +N分遅れ」になる", () => {
    expect(formatStartDelay(14)).toBe("着手 予定より +14分遅れ");
  });

  it("P5-8 S10: 早着手(負)は「着手 予定より N分早い」になる(符号なし絶対値)", () => {
    expect(formatStartDelay(-3)).toBe("着手 予定より 3分早い");
  });

  it("P5-8 S10: 定刻(0)は「着手 予定どおり」になる(境界値)", () => {
    expect(formatStartDelay(0)).toBe("着手 予定どおり");
  });
});
