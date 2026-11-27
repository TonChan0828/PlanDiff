import { describe, expect, it } from "vitest";
import {
  findOverlappingEvents,
  findRecurringOverlaps,
  type OverlapCandidate,
} from "@/lib/calendar/overlap";

// 仕様書: docs/specs/G-94_予定の時間の重なりの警告.md H1〜H3
// 日時はローカルTZで組み立てる(R-1)。定期条件の判定には、同じローカルTZ名を渡す

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const iso = (day: number, hour: number, minute = 0) =>
  new Date(2026, 10, day, hour, minute).toISOString();

const event = (
  id: string,
  day: number,
  startHour: number,
  endHour: number,
  googleEventId = `app:${id}`,
): OverlapCandidate => ({
  id,
  googleEventId,
  title: id,
  startAt: iso(day, startHour),
  endAt: iso(day, endHour),
});

const ids = (events: OverlapCandidate[]) => events.map((e) => e.id);

describe("findOverlappingEvents(G-94)", () => {
  const range = { startAt: iso(24, 10), endAt: iso(24, 12) };

  it("H1: 一部が重なる・包含する・同一時刻の予定を、開始の早い順に返す", () => {
    const events = [
      event("tail", 24, 11, 13),
      event("same", 24, 10, 12),
      event("outer", 24, 9, 14),
      event("head", 24, 9, 11),
    ];

    expect(ids(findOverlappingEvents(events, range))).toEqual([
      "outer",
      "head",
      "same",
      "tail",
    ]);
  });

  it("H1(境界): 終了と開始が同じ隣接する予定と、離れた予定は重ならない", () => {
    const events = [
      event("before", 24, 9, 10),
      event("after", 24, 12, 13),
      event("far", 24, 15, 16),
      event("other-day", 25, 10, 12),
    ];

    expect(findOverlappingEvents(events, range)).toEqual([]);
  });

  it("H2: 編集中の予定は除き、日をまたぐ予定とも判定する", () => {
    const overnight = {
      id: "overnight",
      googleEventId: "app:overnight",
      title: "overnight",
      startAt: iso(23, 23),
      endAt: iso(24, 11),
    };

    expect(
      ids(
        findOverlappingEvents(
          [overnight, event("self", 24, 10, 12)],
          range,
          "self",
        ),
      ),
    ).toEqual(["overnight"]);
  });

  it("終了が開始以前の入力には、何も返さない", () => {
    expect(
      findOverlappingEvents([event("a", 24, 9, 14)], {
        startAt: iso(24, 11),
        endAt: iso(24, 11),
      }),
    ).toEqual([]);
  });
});

describe("findRecurringOverlaps(G-94 H3)", () => {
  // 2026-11-23 は月曜。23(月)〜29(日)の 10:00〜11:00 に予定がある
  const week = [23, 24, 25, 26, 27, 28, 29].map((day) =>
    event(`d${day}`, day, 10, 11),
  );
  const base = {
    pattern: "daily" as const,
    weekdays: null,
    startTime: "10:30",
    endTime: "11:30",
    startsOn: "2026-11-23",
    endsOn: null,
  };

  it("毎日は全ての日、平日は月〜金、毎週は指定曜日の予定を返す", () => {
    expect(findRecurringOverlaps(week, base, TZ)).toHaveLength(7);
    expect(
      ids(findRecurringOverlaps(week, { ...base, pattern: "weekdays" }, TZ)),
    ).toEqual(["d23", "d24", "d25", "d26", "d27"]);
    expect(
      ids(
        findRecurringOverlaps(
          week,
          { ...base, pattern: "weekly", weekdays: [1, 3] },
          TZ,
        ),
      ),
    ).toEqual(["d23", "d25"]);
  });

  it("開始日より前と終了日より後の予定は除く(終了日は含む)", () => {
    expect(
      ids(
        findRecurringOverlaps(
          week,
          { ...base, startsOn: "2026-11-25", endsOn: "2026-11-27" },
          TZ,
        ),
      ),
    ).toEqual(["d25", "d26", "d27"]);
  });

  it("時刻帯が隣接するだけの予定は重ならない", () => {
    expect(
      findRecurringOverlaps(
        week,
        { ...base, startTime: "11:00", endTime: "12:00" },
        TZ,
      ),
    ).toEqual([]);
  });

  it("同じルールの回は除き、別のルールの回は返す", () => {
    const events = [
      event("own", 24, 10, 11, "rec:rule-1:2026-11-24"),
      event("other", 25, 10, 11, "rec:rule-2:2026-11-25"),
    ];

    expect(ids(findRecurringOverlaps(events, base, TZ, "rule-1"))).toEqual([
      "other",
    ]);
  });

  it("毎週で曜日が未選択なら何も返さない。前日から続く予定とも判定する", () => {
    expect(
      findRecurringOverlaps(
        week,
        { ...base, pattern: "weekly", weekdays: [] },
        TZ,
      ),
    ).toEqual([]);
    const overnight = {
      id: "night",
      googleEventId: "app:night",
      title: "night",
      startAt: iso(23, 23),
      endAt: iso(24, 1),
    };
    expect(
      ids(
        findRecurringOverlaps(
          [overnight],
          { ...base, startTime: "00:30", endTime: "02:00" },
          TZ,
        ),
      ),
    ).toEqual(["night"]);
  });
});

describe("findRecurringOverlaps の休止・タイムゾーン・長い予定(G-94 レビュー対応)", () => {
  const rule = {
    pattern: "daily" as const,
    weekdays: null,
    startTime: "10:30",
    endTime: "11:30",
    startsOn: "2026-11-23",
    endsOn: null,
  };

  it("休止する日(開始を含み、終了を含まない)は、回が作られないので重なりにしない", () => {
    const week = [23, 24, 25, 26, 27].map((day) =>
      event(`d${day}`, day, 10, 11),
    );

    expect(
      ids(
        findRecurringOverlaps(
          week,
          {
            ...rule,
            pauses: [{ startsOn: "2026-11-24", endsOn: "2026-11-26" }],
          },
          TZ,
        ),
      ),
    ).toEqual(["d23", "d26", "d27"]);
    expect(
      ids(
        findRecurringOverlaps(
          week,
          { ...rule, pauses: [{ startsOn: "2026-11-25", endsOn: null }] },
          TZ,
        ),
      ),
    ).toEqual(["d23", "d24"]);
  });

  it("曜日と日付は、実行環境ではなく指定したタイムゾーンで判定する", () => {
    // 2026-11-22T20:30Z は、UTC では 11/22(日)だが、Pacific/Kiritimati(UTC+14)では 11/23(月)10:30
    const monday = {
      id: "k",
      googleEventId: "app:k",
      title: "k",
      startAt: "2026-11-22T20:30:00.000Z",
      endAt: "2026-11-22T21:00:00.000Z",
    };
    const weeklyMonday = {
      ...rule,
      pattern: "weekly" as const,
      weekdays: [1],
    };

    expect(
      ids(findRecurringOverlaps([monday], weeklyMonday, "Pacific/Kiritimati")),
    ).toEqual(["k"]);
    expect(findRecurringOverlaps([monday], weeklyMonday, "UTC")).toEqual([]);
  });

  it("調べ始める日より60日以上前から続く長い予定とも判定する", () => {
    const long = {
      id: "long",
      googleEventId: "app:long",
      title: "long",
      startAt: new Date(2026, 7, 1, 0, 0).toISOString(),
      endAt: iso(25, 0),
    };

    expect(ids(findRecurringOverlaps([long], rule, TZ))).toEqual(["long"]);
  });
});
