import { describe, expect, it } from "vitest";

import { TIMER_MESSAGES as T } from "@/lib/timer/messages";

// 仕様書: docs/specs/D-1-2_デザイン刷新.md S4(ズレ表記の符号付きdiff形式)

describe("ズレ表記(S4)", () => {
  it("S4: delayLabelが符号付きdiff形式を返す", () => {
    expect(T.delayLabel(17)).toBe("+17分 遅れ");
  });

  it("S4: overrunLabelが符号付きdiff形式を返す", () => {
    expect(T.overrunLabel(25)).toBe("+25分 超過");
  });

  it("S4: 境界値1分でも符号付きで返す", () => {
    expect(T.delayLabel(1)).toBe("+1分 遅れ");
    expect(T.overrunLabel(1)).toBe("+1分 超過");
  });
});
