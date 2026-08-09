import { describe, expect, it } from "vitest";
import {
  computeGapSummary,
  type SummaryActualEntry,
  type SummaryPlanEvent,
  type SummaryRange,
} from "@/lib/summary/aggregate";
import { computeDailyGapSeries } from "@/lib/summary/chart";

// 仕様書: docs/specs/P7-1_サマリーの日別ズレグラフ.md S1〜S13
//
// R-1(CLAUDE.md): 日時はローカルTZで構築する。ISO文字列の直書き禁止。
// 2026年8月3日(月)〜8月9日(日)の7日間を基準期間にする。

function isoAt(day: number, hour: number, minute = 0): string {
  return new Date(2026, 7, day, hour, minute).toISOString();
}

/** 2026-08-03 00:00 〜 2026-08-10 00:00(7日) */
const WEEK: SummaryRange = {
  start: new Date(2026, 7, 3),
  end: new Date(2026, 7, 10),
};

function plan(
  googleEventId: string,
  day: number,
  startHour: number,
  endHour: number,
): SummaryPlanEvent {
  return {
    googleEventId,
    title: `予定 ${googleEventId}`,
    startAt: isoAt(day, startHour),
    endAt: isoAt(day, endHour),
  };
}

function actual(
  id: string,
  googleEventId: string | null,
  day: number,
  startHour: number,
  endHour: number,
  endMinute = 0,
): SummaryActualEntry {
  return {
    id,
    googleEventId,
    title: `実績 ${id}`,
    startAt: isoAt(day, startHour),
    endAt: isoAt(day, endHour, endMinute),
  };
}

describe("computeDailyGapSeries — 正常系", () => {
  it("S1: 7日の期間で予定も実績も0件なら、7要素すべてが isEmpty かつ ズレ0になる", () => {
    const points = computeDailyGapSeries([], [], WEEK);

    expect(points).toHaveLength(7);
    for (const point of points) {
      expect(point.planMinutes).toBe(0);
      expect(point.actualMinutes).toBe(0);
      expect(point.gapMinutes).toBe(0);
      expect(point.isEmpty).toBe(true);
    }
  });

  it("S2: 同一日に計画60分と実績90分がある場合、その日だけ +30 になり他の日は空になる", () => {
    const points = computeDailyGapSeries(
      [plan("g-1", 5, 9, 10)],
      [actual("a-1", "g-1", 5, 9, 10, 30)],
      WEEK,
    );

    // 8/5 は index 2(8/3 が index 0)
    expect(points[2]?.planMinutes).toBe(60);
    expect(points[2]?.actualMinutes).toBe(90);
    expect(points[2]?.gapMinutes).toBe(30);
    expect(points[2]?.isEmpty).toBe(false);

    for (const [index, point] of points.entries()) {
      if (index === 2) continue;
      expect(point.isEmpty).toBe(true);
    }
  });

  it("S3: 予定に紐づかない実績(割り込み)だけの日も、実績として計上される", () => {
    const points = computeDailyGapSeries(
      [],
      [actual("a-1", null, 4, 13, 13, 30)],
      WEEK,
    );

    expect(points[1]?.planMinutes).toBe(0);
    expect(points[1]?.actualMinutes).toBe(30);
    expect(points[1]?.gapMinutes).toBe(30);
    expect(points[1]?.isEmpty).toBe(false);
  });

  it("S4: 未着手の予定だけの日は、計画ぶんが負のズレになる", () => {
    const points = computeDailyGapSeries([plan("g-1", 3, 9, 10)], [], WEEK);

    expect(points[0]?.planMinutes).toBe(60);
    expect(points[0]?.actualMinutes).toBe(0);
    expect(points[0]?.gapMinutes).toBe(-60);
    expect(points[0]?.isEmpty).toBe(false);
  });

  it("S5: 返る配列は期間の初日から昇順で、各要素の date はローカル0時になる", () => {
    const points = computeDailyGapSeries([], [], WEEK);

    expect(points.map((point) => point.date.getDate())).toEqual([
      3, 4, 5, 6, 7, 8, 9,
    ]);
    for (const point of points) {
      expect(point.date.getHours()).toBe(0);
      expect(point.date.getMinutes()).toBe(0);
      expect(point.date.getSeconds()).toBe(0);
      expect(point.date.getMilliseconds()).toBe(0);
    }
  });
});

describe("computeDailyGapSeries — 異常系", () => {
  it("S6: 期間の初日の前日23:59に開始する予定は、どの日にも計上されない", () => {
    const points = computeDailyGapSeries(
      [
        {
          googleEventId: "g-1",
          title: "前日の予定",
          startAt: new Date(2026, 7, 2, 23, 59).toISOString(),
          endAt: new Date(2026, 7, 3, 1, 0).toISOString(),
        },
      ],
      [],
      WEEK,
    );

    expect(points.every((point) => point.isEmpty)).toBe(true);
  });

  it("S7: 期間の最終日の翌0:00ちょうどに開始する実績は、計上されない(半開区間の上端)", () => {
    const points = computeDailyGapSeries(
      [],
      [
        {
          id: "a-1",
          googleEventId: null,
          title: "翌日の実績",
          startAt: new Date(2026, 7, 10, 0, 0).toISOString(),
          endAt: new Date(2026, 7, 10, 1, 0).toISOString(),
        },
      ],
      WEEK,
    );

    expect(points.every((point) => point.isEmpty)).toBe(true);
  });

  it("S8: start === end の不正な期間では、例外を投げずに空配列を返す", () => {
    const points = computeDailyGapSeries([], [], {
      start: new Date(2026, 7, 3),
      end: new Date(2026, 7, 3),
    });

    expect(points).toEqual([]);
  });
});

describe("computeDailyGapSeries — 境界値", () => {
  it("S9: 日をまたぐ実績(23:00〜翌01:00)は、開始日に120分が全量計上される", () => {
    const points = computeDailyGapSeries(
      [],
      [
        {
          id: "a-1",
          googleEventId: null,
          title: "深夜作業",
          startAt: new Date(2026, 7, 5, 23, 0).toISOString(),
          endAt: new Date(2026, 7, 6, 1, 0).toISOString(),
        },
      ],
      WEEK,
    );

    // 8/5 に全量、8/6 は空のまま
    expect(points[2]?.actualMinutes).toBe(120);
    expect(points[2]?.gapMinutes).toBe(120);
    expect(points[3]?.isEmpty).toBe(true);
  });

  it("S10: 系列の総和が computeGapSummary の集計値と一致する(不変条件)", () => {
    const planEvents: SummaryPlanEvent[] = [
      plan("g-1", 3, 9, 10),
      plan("g-2", 5, 14, 16),
      plan("g-3", 9, 10, 11),
      // 期間外(前日)。どちらの関数も対象外にする
      {
        googleEventId: "g-out",
        title: "期間外の予定",
        startAt: new Date(2026, 7, 2, 9, 0).toISOString(),
        endAt: new Date(2026, 7, 2, 10, 0).toISOString(),
      },
    ];
    const actualEntries: SummaryActualEntry[] = [
      actual("a-1", "g-1", 3, 9, 11),
      actual("a-2", "g-2", 5, 14, 15),
      // 割り込み
      actual("a-3", null, 6, 13, 14),
      // 日またぎ
      {
        id: "a-4",
        googleEventId: null,
        title: "深夜作業",
        startAt: new Date(2026, 7, 8, 23, 0).toISOString(),
        endAt: new Date(2026, 7, 9, 1, 0).toISOString(),
      },
      // 期間外
      {
        id: "a-out",
        googleEventId: null,
        title: "期間外の実績",
        startAt: new Date(2026, 7, 2, 9, 0).toISOString(),
        endAt: new Date(2026, 7, 2, 10, 0).toISOString(),
      },
    ];

    const points = computeDailyGapSeries(planEvents, actualEntries, WEEK);
    const summary = computeGapSummary(planEvents, actualEntries, WEEK);

    const sum = (pick: (point: (typeof points)[number]) => number) =>
      points.reduce((total, point) => total + pick(point), 0);

    expect(sum((point) => point.planMinutes)).toBe(summary.planTotalMinutes);
    expect(sum((point) => point.actualMinutes)).toBe(
      summary.actualTotalMinutes,
    );
    expect(sum((point) => point.gapMinutes)).toBe(summary.gapMinutes);
  });

  it("S11: 期間の初日0:00開始と最終日23:59開始の実績は、先頭と末尾に入る", () => {
    const points = computeDailyGapSeries(
      [],
      [
        {
          id: "a-first",
          googleEventId: null,
          title: "初日0時",
          startAt: new Date(2026, 7, 3, 0, 0).toISOString(),
          endAt: new Date(2026, 7, 3, 0, 30).toISOString(),
        },
        {
          id: "a-last",
          googleEventId: null,
          title: "最終日23:59",
          startAt: new Date(2026, 7, 9, 23, 59).toISOString(),
          endAt: new Date(2026, 7, 10, 0, 29).toISOString(),
        },
      ],
      WEEK,
    );

    expect(points[0]?.actualMinutes).toBe(30);
    expect(points[6]?.actualMinutes).toBe(30);
    expect(points.slice(1, 6).every((point) => point.isEmpty)).toBe(true);
  });

  it("S12: 366日の期間では366要素が返る", () => {
    const points = computeDailyGapSeries([], [], {
      start: new Date(2026, 0, 1),
      end: new Date(2027, 0, 2),
    });

    expect(points).toHaveLength(366);
  });

  it("S13: ズレがちょうど0の日は、データなしの日と区別される(isEmpty === false)", () => {
    const points = computeDailyGapSeries(
      [plan("g-1", 3, 9, 10)],
      [actual("a-1", "g-1", 3, 9, 10)],
      WEEK,
    );

    expect(points[0]?.gapMinutes).toBe(0);
    expect(points[0]?.isEmpty).toBe(false);
    expect(points[1]?.gapMinutes).toBe(0);
    expect(points[1]?.isEmpty).toBe(true);
  });
});
