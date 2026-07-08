import { describe, expect, it } from "vitest";
import {
  computeActualGaps,
  type ActualGapInput,
  type PlanEventForGap,
} from "@/lib/timer/gap";

// 仕様書: docs/specs/P3-1_オーバーレイ表示.md S1〜S7
// 予定と実績の紐づき判定、開始遅延・超過時間の計算を検証する。

function isoAt(hour: number, minute = 0): string {
  return new Date(2026, 6, 7, hour, minute).toISOString();
}

const plan: PlanEventForGap = {
  googleEventId: "g-1",
  startAt: isoAt(9, 0),
  endAt: isoAt(10, 0),
};

function actual(
  id: string,
  googleEventId: string | null,
  startHour: number,
  startMinute: number,
  endHour: number,
  endMinute: number,
): ActualGapInput {
  return {
    id,
    googleEventId,
    startAt: isoAt(startHour, startMinute),
    endAt: isoAt(endHour, endMinute),
  };
}

describe("computeActualGaps", () => {
  it("S1: 実績が予定と同時刻に開始・終了する場合、ズレはなし", () => {
    const result = computeActualGaps(
      [actual("a-1", "g-1", 9, 0, 10, 0)],
      [plan],
    );
    expect(result.get("a-1")).toEqual({
      linked: true,
      startDelayMinutes: 0,
      overrunMinutes: 0,
    });
  });

  it("S2: 実績開始が予定開始より15分遅い場合、startDelayMinutesが計算される", () => {
    const result = computeActualGaps(
      [actual("a-1", "g-1", 9, 15, 10, 0)],
      [plan],
    );
    expect(result.get("a-1")?.startDelayMinutes).toBe(15);
  });

  it("S3: 実績終了が予定終了より20分遅い場合、overrunMinutesが計算される", () => {
    const result = computeActualGaps(
      [actual("a-1", "g-1", 9, 0, 10, 20)],
      [plan],
    );
    expect(result.get("a-1")?.overrunMinutes).toBe(20);
  });

  it("S4: 実績開始・終了が予定より早い場合(早期開始・早期終了)、0未満にならない", () => {
    const result = computeActualGaps(
      [actual("a-1", "g-1", 8, 45, 9, 50)],
      [plan],
    );
    expect(result.get("a-1")).toEqual({
      linked: true,
      startDelayMinutes: 0,
      overrunMinutes: 0,
    });
  });

  it("S5: googleEventIdがnull(フリータイマー)の場合、linked:falseになる", () => {
    const result = computeActualGaps(
      [actual("a-1", null, 9, 0, 10, 0)],
      [plan],
    );
    expect(result.get("a-1")).toEqual({
      linked: false,
      startDelayMinutes: 0,
      overrunMinutes: 0,
    });
  });

  it("S6: googleEventIdが設定されているが同日の予定に一致するものがない場合、linked:falseになる", () => {
    const result = computeActualGaps(
      [actual("a-1", "g-does-not-exist", 9, 0, 10, 0)],
      [plan],
    );
    expect(result.get("a-1")).toEqual({
      linked: false,
      startDelayMinutes: 0,
      overrunMinutes: 0,
    });
  });

  it("S7: 同じ予定に紐づく実績が2件(中断・再開)の場合、最初のみstartDelay・最後のみoverrunが計算される", () => {
    const result = computeActualGaps(
      [actual("a-1", "g-1", 9, 10, 9, 30), actual("a-2", "g-1", 9, 45, 10, 25)],
      [plan],
    );
    expect(result.get("a-1")).toEqual({
      linked: true,
      startDelayMinutes: 10,
      overrunMinutes: 0,
    });
    expect(result.get("a-2")).toEqual({
      linked: true,
      startDelayMinutes: 0,
      overrunMinutes: 25,
    });
  });
});
