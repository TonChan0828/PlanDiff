import { TZDate } from "@date-fns/tz";
import { describe, expect, it } from "vitest";
import type { SyncedEvent } from "@/lib/calendar/events";
import type { RecurringRuleSummary } from "@/lib/calendar/recurring-id";
import {
  computeSuggestions,
  type SuggestionInput,
} from "@/lib/calendar/suggestions";
import type { TimeEntryItem } from "@/lib/timer/types";

// 仕様書: docs/specs/P5-2_実績からの予定提案.md S1〜S13, S24
// 表示週は 2026-07-13(月)〜 2026-07-19(日)。now は 2026-07-14(火)0:00 JST。
// 遡り窓は 2026-06-15(月)0:00 JST 〜 2026-07-13(月)0:00 JST。

const TZ = "Asia/Tokyo";
const VIEW_DATE = "2026-07-14"; // 火曜
const NOW = new Date("2026-07-13T15:00:00.000Z"); // 2026-07-14 00:00 JST

let entrySeq = 0;

/** JSTローカルの "YYYY-MM-DD HH:mm" と所要分から完了実績を作る */
function entry(
  title: string,
  localStart: string,
  durationMin: number,
): TimeEntryItem {
  const [datePart, timePart] = localStart.split(" ");
  const [year, month, day] = (datePart ?? "").split("-").map(Number);
  const [hour, minute] = (timePart ?? "").split(":").map(Number);
  const start = new TZDate(
    year ?? 0,
    (month ?? 1) - 1,
    day ?? 1,
    hour ?? 0,
    minute ?? 0,
    0,
    TZ,
  );
  const end = new Date(start.getTime() + durationMin * 60 * 1000);
  entrySeq += 1;
  return {
    id: `entry-${entrySeq}`,
    title,
    googleEventId: null,
    startAt: new Date(start.getTime()).toISOString(),
    endAt: end.toISOString(),
  };
}

function event(title: string, localStart: string): SyncedEvent {
  const base = entry(title, localStart, 60);
  return {
    id: `event-${entrySeq}`,
    googleEventId: `app:${entrySeq}`,
    title,
    startAt: base.startAt,
    endAt: base.endAt,
    source: "app",
  };
}

function rule(
  title: string,
  pattern: RecurringRuleSummary["pattern"],
  weekdays: number[] | null,
): RecurringRuleSummary {
  return {
    id: `rule-${title}-${pattern}`,
    title,
    pattern,
    weekdays,
    startTime: "09:00",
    endTime: "10:00",
    timezone: TZ,
    startsOn: "2026-06-01",
    endsOn: null,
  };
}

function input(overrides: Partial<SuggestionInput>): SuggestionInput {
  return {
    entries: [],
    events: [],
    recurringRules: [],
    viewDate: VIEW_DATE,
    now: NOW,
    timeZone: TZ,
    ...overrides,
  };
}

describe("computeSuggestions(S1)", () => {
  it("S1: 同タイトル×同曜日×近い時刻が直近4週に2回で候補1件(中央値丸め)が返る", () => {
    const suggestions = computeSuggestions(
      input({
        entries: [
          entry("朝会", "2026-06-30 10:00", 30), // 火
          entry("朝会", "2026-07-07 10:05", 35), // 火
        ],
      }),
    );

    expect(suggestions).toEqual([
      {
        key: "朝会|weekly|2",
        title: "朝会",
        pattern: "weekly",
        weekdays: [2],
        dates: ["2026-07-14"],
        startTime: "10:00", // 中央値 10:02.5 → 15分丸めで 10:00
        endTime: "10:30", // 所要中央値 32.5分 → 30分
        occurrenceCount: 2,
      },
    ]);
  });
});

describe("computeSuggestions(S2)", () => {
  it("S2: 実績が1回のみなら候補なし(閾値2回)", () => {
    const suggestions = computeSuggestions(
      input({ entries: [entry("朝会", "2026-07-07 10:00", 30)] }),
    );
    expect(suggestions).toEqual([]);
  });
});

describe("computeSuggestions(S3)", () => {
  it("S3: 開始時刻差がちょうど60分なら同一クラスタで候補成立", () => {
    const suggestions = computeSuggestions(
      input({
        entries: [
          entry("設計", "2026-06-30 10:00", 60), // 火
          entry("設計", "2026-07-07 11:00", 60), // 火(差60分)
        ],
      }),
    );
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.title).toBe("設計");
    // 中央値 10:30 は15分単位のためそのまま
    expect(suggestions[0]?.startTime).toBe("10:30");
  });

  it("S3: 開始時刻差が61分なら候補不成立", () => {
    const suggestions = computeSuggestions(
      input({
        entries: [
          entry("設計", "2026-06-30 10:00", 60), // 火
          entry("設計", "2026-07-07 11:01", 60), // 火(差61分)
        ],
      }),
    );
    expect(suggestions).toEqual([]);
  });
});

describe("computeSuggestions(S4)", () => {
  it("S4: タイトルは前後空白を無視して同一視される", () => {
    const suggestions = computeSuggestions(
      input({
        entries: [
          entry(" 朝会 ", "2026-06-30 10:00", 30),
          entry("朝会", "2026-07-07 10:00", 30),
        ],
      }),
    );
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.title).toBe("朝会");
  });

  it("S4: 空白のみのタイトルは対象外", () => {
    const suggestions = computeSuggestions(
      input({
        entries: [
          entry("   ", "2026-06-30 10:00", 30),
          entry("   ", "2026-07-07 10:00", 30),
        ],
      }),
    );
    expect(suggestions).toEqual([]);
  });
});

describe("computeSuggestions(S5)", () => {
  it("S5: 表示週の同じ曜日に同タイトルの予定があれば除外される", () => {
    const suggestions = computeSuggestions(
      input({
        entries: [
          entry("朝会", "2026-06-30 10:00", 30),
          entry("朝会", "2026-07-07 10:00", 30),
        ],
        events: [event("朝会", "2026-07-14 15:00")], // 同じ火曜(時刻は違ってよい)
      }),
    );
    expect(suggestions).toEqual([]);
  });

  it("S5: 同じ週でも別の曜日の同タイトル予定では除外されない", () => {
    const suggestions = computeSuggestions(
      input({
        entries: [
          entry("朝会", "2026-06-30 10:00", 30),
          entry("朝会", "2026-07-07 10:00", 30),
        ],
        events: [event("朝会", "2026-07-15 10:00")], // 水曜
      }),
    );
    expect(suggestions).toHaveLength(1);
  });
});

describe("computeSuggestions(S6)", () => {
  const entries = () => [
    entry("朝会", "2026-06-30 10:00", 30), // 火
    entry("朝会", "2026-07-07 10:00", 30), // 火
  ];

  it("S6: dailyルール(同タイトル)があれば除外される", () => {
    const suggestions = computeSuggestions(
      input({
        entries: entries(),
        recurringRules: [rule("朝会", "daily", null)],
      }),
    );
    expect(suggestions).toEqual([]);
  });

  it("S6: weekdaysルール(同タイトル)は平日の候補を除外する", () => {
    const suggestions = computeSuggestions(
      input({
        entries: entries(),
        recurringRules: [rule("朝会", "weekdays", null)],
      }),
    );
    expect(suggestions).toEqual([]);
  });

  it("S6: weeklyルールが該当曜日を含む場合は除外される", () => {
    const suggestions = computeSuggestions(
      input({
        entries: entries(),
        recurringRules: [rule("朝会", "weekly", [2])],
      }),
    );
    expect(suggestions).toEqual([]);
  });

  it("S6: weeklyルールが該当曜日を含まない場合は除外されない", () => {
    const suggestions = computeSuggestions(
      input({
        entries: entries(),
        recurringRules: [rule("朝会", "weekly", [3])],
      }),
    );
    expect(suggestions).toHaveLength(1);
  });

  it("S6: タイトルが異なるルールでは除外されない", () => {
    const suggestions = computeSuggestions(
      input({
        entries: entries(),
        recurringRules: [rule("夕会", "daily", null)],
      }),
    );
    expect(suggestions).toHaveLength(1);
  });
});

describe("computeSuggestions(S7)", () => {
  const mondayEntries = () => [
    entry("週次レビュー", "2026-06-29 09:00", 30), // 月
    entry("週次レビュー", "2026-07-06 09:00", 30), // 月
  ];

  it("S7: 今週表示で既に過ぎた曜日(月曜)は除外される", () => {
    // now = 火曜0:00 JST なので月曜9:00は過去
    const suggestions = computeSuggestions(input({ entries: mondayEntries() }));
    expect(suggestions).toEqual([]);
  });

  it("S7: 来週を表示すると全曜日が対象になる", () => {
    const suggestions = computeSuggestions(
      input({ entries: mondayEntries(), viewDate: "2026-07-21" }),
    );
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.dates).toEqual(["2026-07-20"]); // 来週月曜
  });
});

describe("computeSuggestions(S8)", () => {
  it("S8: 過去の週を表示中は候補が常に空", () => {
    const suggestions = computeSuggestions(
      input({
        entries: [
          entry("朝会", "2026-06-23 10:00", 30), // 火
          entry("朝会", "2026-06-30 10:00", 30), // 火
        ],
        viewDate: "2026-07-07", // 先週
      }),
    );
    expect(suggestions).toEqual([]);
  });
});

describe("computeSuggestions(S9)", () => {
  it("S9: 候補4件以上は発生日数の降順で3件に制限(同数は日時昇順)", () => {
    const suggestions = computeSuggestions(
      input({
        entries: [
          // 4回: 金曜
          entry("A", "2026-06-19 10:00", 30),
          entry("A", "2026-06-26 10:00", 30),
          entry("A", "2026-07-03 10:00", 30),
          entry("A", "2026-07-10 10:00", 30),
          // 3回: 木曜
          entry("B", "2026-06-25 10:00", 30),
          entry("B", "2026-07-02 10:00", 30),
          entry("B", "2026-07-09 10:00", 30),
          // 2回: 土曜9:00(同数タイの早い方)
          entry("C", "2026-07-04 09:00", 30),
          entry("C", "2026-07-11 09:00", 30),
          // 2回: 土曜13:00(同数タイの遅い方 → 落ちる)
          entry("D", "2026-07-04 13:00", 30),
          entry("D", "2026-07-11 13:00", 30),
        ],
      }),
    );
    expect(suggestions.map((s) => s.title)).toEqual(["A", "B", "C"]);
    expect(suggestions.map((s) => s.occurrenceCount)).toEqual([4, 3, 2]);
  });
});

describe("computeSuggestions(S10)", () => {
  it("S10: 開始時刻の中央値が15分単位に四捨五入される", () => {
    const suggestions = computeSuggestions(
      input({
        entries: [
          entry("朝会", "2026-06-30 09:07", 30),
          entry("朝会", "2026-07-07 09:07", 30),
        ],
      }),
    );
    // 9:07 → 15分丸めで 9:00
    expect(suggestions[0]?.startTime).toBe("09:00");

    const suggestions2 = computeSuggestions(
      input({
        entries: [
          entry("夕会", "2026-06-30 17:08", 30),
          entry("夕会", "2026-07-07 17:08", 30),
        ],
      }),
    );
    // 17:08 → 15分丸めで 17:15
    expect(suggestions2[0]?.startTime).toBe("17:15");
  });

  it("S10: 所要時間は15分単位に丸め、最低15分になる", () => {
    const suggestions = computeSuggestions(
      input({
        entries: [
          entry("朝会", "2026-06-30 09:00", 5),
          entry("朝会", "2026-07-07 09:00", 5),
        ],
      }),
    );
    // 所要5分 → 丸めると0分になるため最低15分
    expect(suggestions[0]?.startTime).toBe("09:00");
    expect(suggestions[0]?.endTime).toBe("09:15");
  });
});

describe("computeSuggestions(S11)", () => {
  it("S11: UTCでは月曜でもJSTで火曜未明の実績は火曜として判定される", () => {
    // 2026-06-29T15:30Z = 2026-06-30 00:30 JST(火)
    // 2026-07-06T15:30Z = 2026-07-07 00:30 JST(火)
    const suggestions = computeSuggestions(
      input({
        entries: [
          {
            id: "u1",
            title: "深夜バッチ確認",
            googleEventId: null,
            startAt: "2026-06-29T15:30:00.000Z",
            endAt: "2026-06-29T16:00:00.000Z",
          },
          {
            id: "u2",
            title: "深夜バッチ確認",
            googleEventId: null,
            startAt: "2026-07-06T15:30:00.000Z",
            endAt: "2026-07-06T16:00:00.000Z",
          },
        ],
        // 火曜0:30が対象になるよう now を月曜正午にする
        now: new Date("2026-07-13T03:00:00.000Z"), // 2026-07-13 12:00 JST(月)
      }),
    );
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.weekdays).toEqual([2]); // 火曜(JST基準)
    expect(suggestions[0]?.dates).toEqual(["2026-07-14"]);
    expect(suggestions[0]?.startTime).toBe("00:30");
  });
});

describe("computeSuggestions(S12)", () => {
  it("S12: 表示週開始より28日超前の実績は対象外", () => {
    const suggestions = computeSuggestions(
      input({
        entries: [
          entry("朝会", "2026-06-14 10:00", 30), // 窓の開始(6/15 0:00 JST)より前の日曜
          entry("朝会", "2026-07-07 10:00", 30),
        ],
      }),
    );
    expect(suggestions).toEqual([]);
  });

  it("S12: ちょうど28日前(窓の開始日)の実績は対象に含まれる", () => {
    const suggestions = computeSuggestions(
      input({
        entries: [
          entry("振り返り", "2026-06-15 10:00", 30), // 窓の開始(6/15 0:00 JST)ちょうどの月曜
          entry("振り返り", "2026-07-06 10:00", 30), // 月曜
        ],
        // 月曜10:00が未来になるよう now を月曜朝にする
        now: new Date("2026-07-12T22:00:00.000Z"), // 2026-07-13 07:00 JST(月)
      }),
    );
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.occurrenceCount).toBe(2);
  });
});

describe("computeSuggestions(S13)", () => {
  it("S13: 同じ日の重複計測は発生日数1日と数える", () => {
    const suggestions = computeSuggestions(
      input({
        entries: [
          entry("朝会", "2026-07-07 10:00", 30),
          entry("朝会", "2026-07-07 10:20", 30), // 同日2件目
          entry("朝会", "2026-06-30 10:00", 30),
        ],
      }),
    );
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.occurrenceCount).toBe(2); // 3件だが2日
  });
});

describe("computeSuggestions(S24)", () => {
  it("S24: 丸め後の終了が24:00を超える深夜パターンは除外される", () => {
    const suggestions = computeSuggestions(
      input({
        entries: [
          entry("夜作業", "2026-07-03 23:40", 40), // 金 23:40〜0:20
          entry("夜作業", "2026-07-10 23:40", 40), // 金
        ],
      }),
    );
    // 開始23:45・所要45分 → 終了24:30 で日またぎのため除外
    expect(suggestions).toEqual([]);
  });
});

// P5-7 まとめ提案(S25〜S35)。表示週は来週 2026-07-20(月)〜 2026-07-26(日)。
// 遡り窓は 2026-06-22(月)0:00 JST 〜 2026-07-20(月)0:00 JST。now は既定(07-14)で全日が未来。
const NEXT_WEEK = "2026-07-21";

describe("computeSuggestions(S25)", () => {
  it("S25: 月・水・金が同時間帯で各2日以上 → weekly多曜日カード1件に束ねる", () => {
    const suggestions = computeSuggestions(
      input({
        viewDate: NEXT_WEEK,
        entries: [
          entry("スタンドアップ", "2026-06-22 09:00", 30), // 月
          entry("スタンドアップ", "2026-06-29 09:00", 30), // 月
          entry("スタンドアップ", "2026-06-24 09:00", 30), // 水
          entry("スタンドアップ", "2026-07-01 09:00", 30), // 水
          entry("スタンドアップ", "2026-06-26 09:00", 30), // 金
          entry("スタンドアップ", "2026-07-03 09:00", 30), // 金
        ],
      }),
    );
    expect(suggestions).toEqual([
      {
        key: "スタンドアップ|weekly|1,3,5",
        title: "スタンドアップ",
        pattern: "weekly",
        weekdays: [1, 3, 5],
        dates: ["2026-07-20", "2026-07-22", "2026-07-24"],
        startTime: "09:00",
        endTime: "09:30",
        occurrenceCount: 6,
      },
    ]);
  });
});

describe("computeSuggestions(S26)", () => {
  it("S26: 月〜金すべてが同時間帯 → pattern='weekdays'", () => {
    const suggestions = computeSuggestions(
      input({
        viewDate: NEXT_WEEK,
        entries: [
          entry("朝会", "2026-06-22 09:00", 30), // 月
          entry("朝会", "2026-06-29 09:00", 30),
          entry("朝会", "2026-06-23 09:00", 30), // 火
          entry("朝会", "2026-06-30 09:00", 30),
          entry("朝会", "2026-06-24 09:00", 30), // 水
          entry("朝会", "2026-07-01 09:00", 30),
          entry("朝会", "2026-06-25 09:00", 30), // 木
          entry("朝会", "2026-07-02 09:00", 30),
          entry("朝会", "2026-06-26 09:00", 30), // 金
          entry("朝会", "2026-07-03 09:00", 30),
        ],
      }),
    );
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.pattern).toBe("weekdays");
    expect(suggestions[0]?.weekdays).toEqual([1, 2, 3, 4, 5]);
    expect(suggestions[0]?.occurrenceCount).toBe(10);
    expect(suggestions[0]?.key).toBe("朝会|weekdays|1,2,3,4,5");
  });
});

describe("computeSuggestions(S27)", () => {
  it("S27: 全7曜日が同時間帯 → pattern='daily'", () => {
    const suggestions = computeSuggestions(
      input({
        viewDate: NEXT_WEEK,
        entries: [
          // 日
          entry("運動", "2026-06-28 07:00", 30),
          entry("運動", "2026-07-05 07:00", 30),
          // 月
          entry("運動", "2026-06-22 07:00", 30),
          entry("運動", "2026-06-29 07:00", 30),
          // 火
          entry("運動", "2026-06-23 07:00", 30),
          entry("運動", "2026-06-30 07:00", 30),
          // 水
          entry("運動", "2026-06-24 07:00", 30),
          entry("運動", "2026-07-01 07:00", 30),
          // 木
          entry("運動", "2026-06-25 07:00", 30),
          entry("運動", "2026-07-02 07:00", 30),
          // 金
          entry("運動", "2026-06-26 07:00", 30),
          entry("運動", "2026-07-03 07:00", 30),
          // 土
          entry("運動", "2026-06-27 07:00", 30),
          entry("運動", "2026-07-04 07:00", 30),
        ],
      }),
    );
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.pattern).toBe("daily");
    expect(suggestions[0]?.weekdays).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(suggestions[0]?.occurrenceCount).toBe(14);
  });
});

describe("computeSuggestions(S28)", () => {
  it("S28: 同時間帯が2曜日のみなら束ねず個別weekly2件(閾値3未満)", () => {
    const suggestions = computeSuggestions(
      input({
        viewDate: NEXT_WEEK,
        entries: [
          entry("ペア作業", "2026-06-22 09:00", 30), // 月
          entry("ペア作業", "2026-06-29 09:00", 30),
          entry("ペア作業", "2026-06-24 09:00", 30), // 水
          entry("ペア作業", "2026-07-01 09:00", 30),
        ],
      }),
    );
    expect(suggestions).toHaveLength(2);
    expect(suggestions.map((s) => s.pattern)).toEqual(["weekly", "weekly"]);
    expect(suggestions.map((s) => s.weekdays)).toEqual([[1], [3]]);
  });
});

describe("computeSuggestions(S29)", () => {
  it("S29: 3曜日で差ちょうど60分は束ねる", () => {
    const suggestions = computeSuggestions(
      input({
        viewDate: NEXT_WEEK,
        entries: [
          entry("設計", "2026-06-22 09:00", 30), // 月 09:00
          entry("設計", "2026-06-29 09:00", 30),
          entry("設計", "2026-06-24 09:00", 30), // 水 09:00
          entry("設計", "2026-07-01 09:00", 30),
          entry("設計", "2026-06-26 10:00", 30), // 金 10:00(月と差60分)
          entry("設計", "2026-07-03 10:00", 30),
        ],
      }),
    );
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.weekdays).toEqual([1, 3, 5]);
  });

  it("S29: 差61分で1曜日が外れ、残り2曜日<3で全て個別になる", () => {
    const suggestions = computeSuggestions(
      input({
        viewDate: NEXT_WEEK,
        entries: [
          entry("設計", "2026-06-22 09:00", 30), // 月 09:00
          entry("設計", "2026-06-29 09:00", 30),
          entry("設計", "2026-06-24 09:00", 30), // 水 09:00
          entry("設計", "2026-07-01 09:00", 30),
          entry("設計", "2026-06-26 10:01", 30), // 金 10:01(月と差61分)
          entry("設計", "2026-07-03 10:01", 30),
        ],
      }),
    );
    expect(suggestions).toHaveLength(3);
    expect(suggestions.every((s) => s.pattern === "weekly")).toBe(true);
    expect(suggestions.every((s) => s.weekdays.length === 1)).toBe(true);
  });
});

describe("computeSuggestions(S30)", () => {
  it("S30: 午前3曜日+午後3曜日の別時間帯は2つの束ねに分かれる", () => {
    const suggestions = computeSuggestions(
      input({
        viewDate: NEXT_WEEK,
        entries: [
          // 午前(09:00): 月火水
          entry("集中", "2026-06-22 09:00", 30),
          entry("集中", "2026-06-29 09:00", 30),
          entry("集中", "2026-06-23 09:00", 30),
          entry("集中", "2026-06-30 09:00", 30),
          entry("集中", "2026-06-24 09:00", 30),
          entry("集中", "2026-07-01 09:00", 30),
          // 午後(14:00): 木金土
          entry("集中", "2026-06-25 14:00", 30),
          entry("集中", "2026-07-02 14:00", 30),
          entry("集中", "2026-06-26 14:00", 30),
          entry("集中", "2026-07-03 14:00", 30),
          entry("集中", "2026-06-27 14:00", 30),
          entry("集中", "2026-07-04 14:00", 30),
        ],
      }),
    );
    expect(suggestions).toHaveLength(2);
    expect(suggestions.map((s) => s.weekdays)).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    expect(suggestions.map((s) => s.startTime)).toEqual(["09:00", "14:00"]);
  });
});

describe("computeSuggestions(S31)", () => {
  const bundleEntries = () => [
    entry("レビュー", "2026-06-22 09:00", 30), // 月
    entry("レビュー", "2026-06-29 09:00", 30),
    entry("レビュー", "2026-06-24 09:00", 30), // 水
    entry("レビュー", "2026-07-01 09:00", 30),
    entry("レビュー", "2026-06-26 09:00", 30), // 金
    entry("レビュー", "2026-07-03 09:00", 30),
  ];

  it("S31: 束ねの一部曜日が表示週で既存予定なら除外され残りで出る", () => {
    const suggestions = computeSuggestions(
      input({
        viewDate: NEXT_WEEK,
        entries: bundleEntries(),
        events: [event("レビュー", "2026-07-22 15:00")], // 水曜(表示週)
      }),
    );
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.weekdays).toEqual([1, 5]); // 水が除外され月・金
    expect(suggestions[0]?.dates).toEqual(["2026-07-20", "2026-07-24"]);
    expect(suggestions[0]?.occurrenceCount).toBe(4);
  });

  it("S31: 全曜日が除外されるとカードは出ない", () => {
    const suggestions = computeSuggestions(
      input({
        viewDate: NEXT_WEEK,
        entries: bundleEntries(),
        events: [
          event("レビュー", "2026-07-20 15:00"), // 月
          event("レビュー", "2026-07-22 15:00"), // 水
          event("レビュー", "2026-07-24 15:00"), // 金
        ],
      }),
    );
    expect(suggestions).toEqual([]);
  });
});

describe("computeSuggestions(S32)", () => {
  it("S32: 束ねのunion中央値が15分丸め・所要は最低15分", () => {
    const suggestions = computeSuggestions(
      input({
        viewDate: NEXT_WEEK,
        entries: [
          entry("巡回", "2026-06-22 09:05", 5), // 月
          entry("巡回", "2026-06-29 09:05", 5),
          entry("巡回", "2026-06-24 09:05", 5), // 水
          entry("巡回", "2026-07-01 09:05", 5),
          entry("巡回", "2026-06-26 09:05", 5), // 金
          entry("巡回", "2026-07-03 09:05", 5),
        ],
      }),
    );
    expect(suggestions).toHaveLength(1);
    // 09:05 → 15分丸めで 09:00、所要5分 → 丸め0 → 最低15分
    expect(suggestions[0]?.startTime).toBe("09:00");
    expect(suggestions[0]?.endTime).toBe("09:15");
  });
});

describe("computeSuggestions(S33)", () => {
  it("S33: 束ねの丸め後終了が24:00超なら候補ごと除外", () => {
    const suggestions = computeSuggestions(
      input({
        viewDate: NEXT_WEEK,
        entries: [
          entry("夜間作業", "2026-06-22 23:40", 40), // 月 → 23:45+45=24:30
          entry("夜間作業", "2026-06-29 23:40", 40),
          entry("夜間作業", "2026-06-24 23:40", 40), // 水
          entry("夜間作業", "2026-07-01 23:40", 40),
          entry("夜間作業", "2026-06-26 23:40", 40), // 金
          entry("夜間作業", "2026-07-03 23:40", 40),
        ],
      }),
    );
    expect(suggestions).toEqual([]);
  });
});

describe("computeSuggestions(S34)", () => {
  const allWeek = () => [
    entry("運動", "2026-06-28 07:00", 30), // 日
    entry("運動", "2026-07-05 07:00", 30),
    entry("運動", "2026-06-22 07:00", 30), // 月
    entry("運動", "2026-06-29 07:00", 30),
    entry("運動", "2026-06-23 07:00", 30), // 火
    entry("運動", "2026-06-30 07:00", 30),
    entry("運動", "2026-06-24 07:00", 30), // 水
    entry("運動", "2026-07-01 07:00", 30),
    entry("運動", "2026-06-25 07:00", 30), // 木
    entry("運動", "2026-07-02 07:00", 30),
    entry("運動", "2026-06-26 07:00", 30), // 金
    entry("運動", "2026-07-03 07:00", 30),
    entry("運動", "2026-06-27 07:00", 30), // 土
    entry("運動", "2026-07-04 07:00", 30),
  ];

  it("S34: dailyルールがあれば毎日束ねは出ない", () => {
    const suggestions = computeSuggestions(
      input({
        viewDate: NEXT_WEEK,
        entries: allWeek(),
        recurringRules: [rule("運動", "daily", null)],
      }),
    );
    expect(suggestions).toEqual([]);
  });

  it("S34: weekdaysルールなら平日が除外され土日で出る", () => {
    const suggestions = computeSuggestions(
      input({
        viewDate: NEXT_WEEK,
        entries: allWeek(),
        recurringRules: [rule("運動", "weekdays", null)],
      }),
    );
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.pattern).toBe("weekly");
    expect(suggestions[0]?.weekdays).toEqual([0, 6]); // 日・土
    expect(suggestions[0]?.occurrenceCount).toBe(4);
  });
});

describe("computeSuggestions(S35)", () => {
  it("S35: 束ね(発生日数合計大)が個別より上位・全体最大3件", () => {
    const suggestions = computeSuggestions(
      input({
        viewDate: NEXT_WEEK,
        entries: [
          // A: 月〜金 09:00(合計10)
          entry("A", "2026-06-22 09:00", 30),
          entry("A", "2026-06-29 09:00", 30),
          entry("A", "2026-06-23 09:00", 30),
          entry("A", "2026-06-30 09:00", 30),
          entry("A", "2026-06-24 09:00", 30),
          entry("A", "2026-07-01 09:00", 30),
          entry("A", "2026-06-25 09:00", 30),
          entry("A", "2026-07-02 09:00", 30),
          entry("A", "2026-06-26 09:00", 30),
          entry("A", "2026-07-03 09:00", 30),
          // B: 土 15:00(2)
          entry("B", "2026-06-27 15:00", 30),
          entry("B", "2026-07-04 15:00", 30),
          // C: 日 16:00(2)
          entry("C", "2026-06-28 16:00", 30),
          entry("C", "2026-07-05 16:00", 30),
          // D: 火 17:00(2)
          entry("D", "2026-06-23 17:00", 30),
          entry("D", "2026-06-30 17:00", 30),
        ],
      }),
    );
    expect(suggestions).toHaveLength(3);
    expect(suggestions[0]?.title).toBe("A");
    expect(suggestions[0]?.pattern).toBe("weekdays");
    expect(suggestions[0]?.occurrenceCount).toBe(10);
  });
});
