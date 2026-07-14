import { describe, expect, it } from "vitest";
import {
  computeGapSummary,
  type SummaryActualEntry,
  type SummaryPlanEvent,
  type SummaryRange,
} from "@/lib/summary/aggregate";

// 仕様書: docs/specs/P5-1_定期予定.md S25
// 定期予定のキー(googleEventId='rec:<ruleId>:<date>')でも既存の紐づけ集計が機能することを確認する

const range: SummaryRange = {
  start: new Date("2026-07-10T00:00:00.000Z"),
  end: new Date("2026-07-11T00:00:00.000Z"),
};

const recurringPlan: SummaryPlanEvent = {
  googleEventId: "rec:rule-1:2026-07-10",
  title: "朝会",
  startAt: "2026-07-10T00:00:00.000Z",
  endAt: "2026-07-10T00:30:00.000Z",
};

const linkedActual: SummaryActualEntry = {
  id: "entry-1",
  title: "朝会",
  googleEventId: "rec:rule-1:2026-07-10",
  startAt: "2026-07-10T00:00:00.000Z",
  endAt: "2026-07-10T00:25:00.000Z",
};

describe("computeGapSummary の rec: キー互換(S25)", () => {
  it("S25: 定期予定と同キーの実績は linked として集計され、割り込み扱いにならない", () => {
    const summary = computeGapSummary([recurringPlan], [linkedActual], range);

    expect(summary.items).toHaveLength(1);
    expect(summary.items[0]).toMatchObject({
      googleEventId: "rec:rule-1:2026-07-10",
      planMinutes: 30,
      actualMinutes: 25,
      notStarted: false,
    });
    expect(summary.interruptions).toHaveLength(0);
  });

  it("対応する定期予定が存在しない(この回のみ削除後を想定)場合は割り込み実績として集計される", () => {
    const summary = computeGapSummary([], [linkedActual], range);

    expect(summary.items).toHaveLength(0);
    expect(summary.interruptions).toHaveLength(1);
    expect(summary.interruptions[0]).toMatchObject({
      id: "entry-1",
      title: "朝会",
      actualMinutes: 25,
    });
  });
});
