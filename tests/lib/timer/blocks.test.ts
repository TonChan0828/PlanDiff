import { describe, expect, it } from "vitest";
import { layoutDayEvents } from "@/lib/calendar/layout";
import { actualBlockInputs } from "@/lib/timer/blocks";
import type { RunningEntry, TimeEntryItem } from "@/lib/timer/types";

// 仕様書: docs/specs/P2-2_予定連動タイマー.md S2
// 実績エントリ(確定+実行中)を右レーン用のブロック入力に変換し、
// P2-1と同じ配置計算(クリップ・最小高さ)がそのまま使えることを確認する。

const day = new Date(2026, 6, 7); // 2026-07-07(ローカルTZ)

function isoAt(hour: number, minute = 0): string {
  return new Date(2026, 6, 7, hour, minute).toISOString();
}

const confirmed: TimeEntryItem[] = [
  {
    id: "entry-1",
    title: "設計レビュー",
    googleEventId: "g-1",
    startAt: isoAt(9, 0),
    endAt: isoAt(10, 30),
  },
];

const running: RunningEntry = {
  id: "entry-run",
  title: "実装作業",
  googleEventId: "g-2",
  startAt: isoAt(14, 0),
};

describe("actualBlockInputs(S2)", () => {
  it("S2: 確定済み実績はそのままブロック入力になり、配置計算で正しい位置になる", () => {
    const inputs = actualBlockInputs(confirmed, null, new Date(2026, 6, 7, 15));
    expect(inputs).toHaveLength(1);

    const blocks = layoutDayEvents(inputs, day);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.topPercent).toBeCloseTo((9 / 24) * 100);
    expect(blocks[0]!.heightPercent).toBeCloseTo((1.5 / 24) * 100);
  });

  it("S2: 実行中エントリは start〜現在時刻のブロックになる", () => {
    const now = new Date(2026, 6, 7, 15, 0);
    const inputs = actualBlockInputs([], running, now);
    expect(inputs).toHaveLength(1);
    expect(inputs[0]!.startAt).toBe(running.startAt);
    expect(inputs[0]!.endAt).toBe(now.toISOString());

    const blocks = layoutDayEvents(inputs, day);
    expect(blocks[0]!.topPercent).toBeCloseTo((14 / 24) * 100);
    expect(blocks[0]!.heightPercent).toBeCloseTo((1 / 24) * 100);
  });

  it("S2: 開始直後の実行中エントリも最小高さが確保される(高さ0にならない)", () => {
    const now = new Date(2026, 6, 7, 14, 0, 30);
    const blocks = layoutDayEvents(actualBlockInputs([], running, now), day);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.heightPercent).toBeGreaterThan(0);
  });

  it("S2: 確定済みと実行中を同時に変換できる", () => {
    const now = new Date(2026, 6, 7, 15, 0);
    const inputs = actualBlockInputs(confirmed, running, now);
    expect(inputs.map((input) => input.id)).toEqual(["entry-1", "entry-run"]);
  });
});

// 仕様書: docs/specs/P2-4_実績の手動編集.md S1
describe("actualBlockInputs editableフラグ(S1)", () => {
  it("S1: 確定済み実績はeditable:true、実行中エントリはeditable:falseになる", () => {
    const now = new Date(2026, 6, 7, 15, 0);
    const inputs = actualBlockInputs(confirmed, running, now);
    const confirmedInput = inputs.find((input) => input.id === "entry-1");
    const runningInput = inputs.find((input) => input.id === "entry-run");
    expect(confirmedInput?.editable).toBe(true);
    expect(runningInput?.editable).toBe(false);
  });
});
