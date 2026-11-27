import { describe, expect, it } from "vitest";
import {
  isLongDuration,
  isPlanOverrun,
  suggestedEndAt,
} from "@/lib/timer/forgotten";

// 仕様書: docs/specs/G-91_タイマーの止め忘れ対策.md I1〜I3
// 日時はローカルTZで組み立てる(R-1)。現在時刻は引数で渡す

const at = (hour: number, minute = 0, day = 7) =>
  new Date(2026, 6, day, hour, minute).toISOString();

describe("isLongDuration(G-91 I1)", () => {
  it("6時間の1分前は長時間でなく、ちょうど6時間は長時間", () => {
    expect(isLongDuration(at(9), at(14, 59))).toBe(false);
    expect(isLongDuration(at(9), at(15))).toBe(true);
  });

  it("日をまたいでも経過で判定し、不正な日時は長時間にしない", () => {
    expect(isLongDuration(at(22, 0, 6), at(4))).toBe(true);
    expect(isLongDuration("invalid", at(4))).toBe(false);
  });
});

describe("isPlanOverrun(G-91 I2)", () => {
  const plan = { startAt: at(9), endAt: at(10) };

  it("予定の終了から14分は超過とせず、15分ちょうどは超過", () => {
    expect(isPlanOverrun(plan, at(10, 14))).toBe(false);
    expect(isPlanOverrun(plan, at(10, 15))).toBe(true);
  });

  it("予定がなければ超過にしない", () => {
    expect(isPlanOverrun(undefined, at(23))).toBe(false);
  });
});

describe("suggestedEndAt(G-91 I3)", () => {
  const entry = { startAt: at(9, 30), endAt: at(18) };

  it("予定の終了が実績の開始より後で終了より前なら、予定の終了を候補にする", () => {
    expect(suggestedEndAt(entry, { startAt: at(9), endAt: at(10) })).toBe(
      at(10),
    );
  });

  it("予定の終了が実績の開始以前、または実績の終了以降なら候補はない", () => {
    expect(
      suggestedEndAt(entry, { startAt: at(8), endAt: at(9, 30) }),
    ).toBeNull();
    expect(
      suggestedEndAt(entry, { startAt: at(17), endAt: at(18) }),
    ).toBeNull();
    expect(suggestedEndAt(entry, undefined)).toBeNull();
  });
});
