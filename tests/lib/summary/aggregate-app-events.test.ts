import { describe, expect, it } from "vitest";
import {
  computeGapSummary,
  type SummaryActualEntry,
  type SummaryPlanEvent,
  type SummaryRange,
} from "@/lib/summary/aggregate";

// 仕様書: docs/specs/P2-5_アプリ内予定とGoogle連携凍結.md S9 / S10
// アプリ予定のキー(googleEventId='app:<uuid>')でも既存の紐づけ集計が機能することを確認する

const range: SummaryRange = {
  start: new Date("2026-07-10T00:00:00.000Z"),
  end: new Date("2026-07-11T00:00:00.000Z"),
};

const appPlan: SummaryPlanEvent = {
  googleEventId: "app:uuid-1",
  title: "実装作業",
  startAt: "2026-07-10T01:00:00.000Z",
  endAt: "2026-07-10T03:00:00.000Z",
};

const linkedActual: SummaryActualEntry = {
  id: "entry-1",
  title: "実装作業",
  googleEventId: "app:uuid-1",
  startAt: "2026-07-10T01:00:00.000Z",
  endAt: "2026-07-10T02:30:00.000Z",
};

describe("computeGapSummary の app: キー互換(P2-5)", () => {
  it("S9: アプリ予定と同キーの実績は linked として集計され、割り込み扱いにならない", () => {
    const summary = computeGapSummary([appPlan], [linkedActual], range);

    expect(summary.items).toHaveLength(1);
    expect(summary.items[0]).toMatchObject({
      googleEventId: "app:uuid-1",
      planMinutes: 120,
      actualMinutes: 90,
      notStarted: false,
    });
    expect(summary.interruptions).toHaveLength(0);
  });

  it("S10: 予定が存在しない app: キーの実績(予定削除後)は割り込み実績として集計される", () => {
    const summary = computeGapSummary([], [linkedActual], range);

    expect(summary.items).toHaveLength(0);
    expect(summary.interruptions).toHaveLength(1);
    expect(summary.interruptions[0]).toMatchObject({
      id: "entry-1",
      title: "実装作業",
      actualMinutes: 90,
    });
  });
});
