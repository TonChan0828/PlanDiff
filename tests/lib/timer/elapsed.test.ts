import { describe, expect, it } from "vitest";
import { formatElapsed } from "@/lib/timer/elapsed";

// 仕様書: docs/specs/P2-2_予定連動タイマー.md S1

describe("formatElapsed(S1)", () => {
  const start = new Date(2026, 6, 7, 9, 0, 0);
  const at = (seconds: number) => new Date(start.getTime() + seconds * 1000);

  it("S1: 開始直後(0秒)は 0:00:00", () => {
    expect(formatElapsed(start.toISOString(), at(0))).toBe("0:00:00");
  });

  it("S1: 1時間未満の境界(59分59秒)は 0:59:59", () => {
    expect(formatElapsed(start.toISOString(), at(3599))).toBe("0:59:59");
  });

  it("S1: 1時間ちょうどは 1:00:00", () => {
    expect(formatElapsed(start.toISOString(), at(3600))).toBe("1:00:00");
  });

  it("S1: 途中経過は H:MM:SS(1:23:45)", () => {
    expect(
      formatElapsed(start.toISOString(), at(1 * 3600 + 23 * 60 + 45)),
    ).toBe("1:23:45");
  });

  it("S1: 24時間を超えても時間は繰り上げず表示する(25:00:00)", () => {
    expect(formatElapsed(start.toISOString(), at(25 * 3600))).toBe("25:00:00");
  });

  it("S1: 時計のズレで負になる場合は 0:00:00 に丸める", () => {
    expect(formatElapsed(start.toISOString(), at(-5))).toBe("0:00:00");
  });
});
