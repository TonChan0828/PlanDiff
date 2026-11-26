import { describe, expect, it } from "vitest";
import { computePlanActualDiff } from "@/lib/timer/gap";

// 仕様書: docs/specs/G-98_実績編集の予定との差分表示.md E1〜E5
// 定義はサマリー(P5-8)と同じ: 所要の差 = 同じ予定の実績合計 − 予定、開始の差 = 最も早い実績の開始 − 予定の開始。
// 日時はローカルTZで組み立てる(R-1)

const at = (hour: number, minute = 0, second = 0) =>
  new Date(2026, 6, 7, hour, minute, second).toISOString();

const PLAN = { googleEventId: "g-1", startAt: at(9), endAt: at(10) };

const actual = (
  id: string,
  startAt: string,
  endAt: string,
  googleEventId: string | null = "g-1",
) => ({ id, googleEventId, startAt, endAt });

describe("computePlanActualDiff(G-98)", () => {
  it("E1: 遅れて始めて長引いた実績は、開始と所要の差が正になる", () => {
    const edited = actual("a", at(9, 8), at(10, 14));

    expect(computePlanActualDiff(edited, [edited], PLAN)).toEqual({
      startDiffMinutes: 8,
      durationDiffMinutes: 6,
      entryCount: 1,
    });
  });

  it("E2: 早く始めて短い実績は差が負になり、ぴったりなら0になる", () => {
    const early = actual("a", at(8, 55), at(9, 48));
    const exact = actual("a", at(9), at(10));

    expect(computePlanActualDiff(early, [early], PLAN)).toEqual({
      startDiffMinutes: -5,
      durationDiffMinutes: -7,
      entryCount: 1,
    });
    expect(computePlanActualDiff(exact, [exact], PLAN)).toEqual({
      startDiffMinutes: 0,
      durationDiffMinutes: 0,
      entryCount: 1,
    });
  });

  it("E3: 同じ予定の実績が複数あれば、所要は合計、開始は最も早いもので計算する", () => {
    const first = actual("a", at(9, 10), at(9, 40));
    const edited = actual("b", at(10), at(10, 40));

    expect(computePlanActualDiff(edited, [first, edited], PLAN)).toEqual({
      startDiffMinutes: 10,
      durationDiffMinutes: 10,
      entryCount: 2,
    });
  });

  it("E3: 編集中の実績は、一覧の古い値ではなく入力中の値で数える(二重に数えない)", () => {
    const stored = actual("a", at(9), at(9, 30));
    const editing = actual("a", at(9), at(10, 15));

    expect(computePlanActualDiff(editing, [stored], PLAN)).toEqual({
      startDiffMinutes: 0,
      durationDiffMinutes: 15,
      entryCount: 1,
    });
  });

  it("E4: 別の予定の実績は合計に入れない", () => {
    const edited = actual("a", at(9), at(9, 30));
    const other = actual("x", at(8), at(9), "g-2");
    const free = actual("y", at(7), at(8), null);

    expect(computePlanActualDiff(edited, [edited, other, free], PLAN)).toEqual({
      startDiffMinutes: 0,
      durationDiffMinutes: -30,
      entryCount: 1,
    });
  });

  it("E4: 編集中の実績がその予定に紐づかなければ null", () => {
    const free = actual("a", at(9), at(10), null);
    const other = actual("a", at(9), at(10), "g-2");

    expect(computePlanActualDiff(free, [free], PLAN)).toBeNull();
    expect(computePlanActualDiff(other, [other], PLAN)).toBeNull();
  });

  it("E5: 終了が開始より前・不正な日時なら null。開始と終了が同じなら計算する", () => {
    const reversed = actual("a", at(10), at(9));
    const invalid = actual("a", "not-a-date", at(9));
    const zero = actual("a", at(9), at(9));

    expect(computePlanActualDiff(reversed, [], PLAN)).toBeNull();
    expect(computePlanActualDiff(invalid, [], PLAN)).toBeNull();
    expect(computePlanActualDiff(zero, [], PLAN)?.durationDiffMinutes).toBe(
      -60,
    );
  });

  it("秒の端数は、サマリーと同じく実績ごとに切り捨ててから合計する", () => {
    const first = actual("a", at(9, 0, 0), at(9, 20, 59));
    const second = actual("b", at(9, 30, 0), at(9, 50, 59));

    expect(
      computePlanActualDiff(second, [first, second], PLAN)?.durationDiffMinutes,
    ).toBe(20 + 20 - 60);
  });
});
