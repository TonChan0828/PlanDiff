import { describe, expect, it } from "vitest";

import { computeSyncRange } from "@/lib/google/sync-range";

// 仕様書: docs/specs/P1-2_カレンダー同期.md S8
// 期待値は実行環境のローカルタイムゾーンで組み立てる(new Date(y, m, d) はローカル時刻)。

describe("computeSyncRange", () => {
  it("S8: 週の途中(水曜)から、その週の月曜00:00の −7日〜+14日 のUTC期間が返る", () => {
    // 2026-07-08 は水曜。週の月曜は 2026-07-06
    const range = computeSyncRange(new Date(2026, 6, 8, 10, 30));

    expect(range.timeMin).toBe(new Date(2026, 5, 29, 0, 0, 0).toISOString());
    expect(range.timeMax).toBe(new Date(2026, 6, 20, 0, 0, 0).toISOString());
  });

  it("S8: 日曜は前週扱いにならず、同じ週(月曜始まり)の期間が返る", () => {
    // 2026-07-12 は日曜。週の月曜は 2026-07-06
    const range = computeSyncRange(new Date(2026, 6, 12, 23, 59));

    expect(range.timeMin).toBe(new Date(2026, 5, 29, 0, 0, 0).toISOString());
    expect(range.timeMax).toBe(new Date(2026, 6, 20, 0, 0, 0).toISOString());
  });

  it("S8: 月曜00:00ちょうどでも同じ週の期間が返る", () => {
    const range = computeSyncRange(new Date(2026, 6, 6, 0, 0, 0));

    expect(range.timeMin).toBe(new Date(2026, 5, 29, 0, 0, 0).toISOString());
    expect(range.timeMax).toBe(new Date(2026, 6, 20, 0, 0, 0).toISOString());
  });
});
