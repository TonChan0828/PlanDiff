import { describe, expect, it } from "vitest";

import {
  formatClockMinutes,
  formatSignedClockMinutes,
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
