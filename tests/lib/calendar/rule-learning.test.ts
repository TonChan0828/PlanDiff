import { TZDate } from "@date-fns/tz";
import { describe, expect, it } from "vitest";
import { RECURRING_ID_PREFIX } from "@/lib/calendar/recurring-id";
import type { RecurringRuleSummary } from "@/lib/calendar/recurring-id";
import { computeRuleAdjustments } from "@/lib/calendar/rule-learning";
import type { TimeEntryItem } from "@/lib/timer/types";

// 仕様書: docs/specs/P10-1_提案経由予定の学習補正.md T1〜T12
// 基準時刻(now)は 2026-08-13 12:00 JST。ホストのTZ設定に依存しないよう、
// 日時はすべて TZDate で明示タイムゾーン付きに構築する(CLAUDE.md R-1)。

const TZ = "Asia/Tokyo";
const NOW = new Date(new TZDate(2026, 7, 13, 12, 0, 0, TZ).getTime());
const MS_PER_DAY = 24 * 60 * 60 * 1000;

let entrySeq = 0;

/** ruleIdに紐づく実績を、指定タイムゾーンのローカル"YYYY-MM-DD HH:mm"と所要分から作る */
function ruleEntry(
  ruleId: string,
  localStart: string,
  durationMin: number,
  timeZone = TZ,
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
    timeZone,
  );
  const end = new Date(start.getTime() + durationMin * 60 * 1000);
  entrySeq += 1;
  return {
    id: `entry-${entrySeq}`,
    title: "実績",
    googleEventId: `${RECURRING_ID_PREFIX}${ruleId}:${datePart}`,
    startAt: new Date(start.getTime()).toISOString(),
    endAt: end.toISOString(),
  };
}

function makeRule(
  overrides: Partial<RecurringRuleSummary> = {},
): RecurringRuleSummary {
  return {
    id: "rule-1",
    title: "朝会",
    pattern: "weekly",
    weekdays: [1, 2, 3, 4, 5],
    startTime: "09:00",
    endTime: "09:30",
    timezone: TZ,
    startsOn: "2026-01-01",
    endsOn: null,
    origin: "suggestion",
    lastLearnedAt: null,
    ...overrides,
  };
}

function isoDaysBefore(now: Date, days: number): string {
  return new Date(now.getTime() - days * MS_PER_DAY).toISOString();
}

describe("computeRuleAdjustments(T1)", () => {
  it("T1: 実績3件が現在値と15分以上ずれる Then 中央値ベースの新しい値でchanged:trueが返る", () => {
    const rule = makeRule({ startTime: "09:00", endTime: "09:30" });
    const entries = [
      ruleEntry("rule-1", "2026-07-06 09:15", 40),
      ruleEntry("rule-1", "2026-07-13 09:15", 45),
      ruleEntry("rule-1", "2026-07-20 09:15", 50),
    ];

    const result = computeRuleAdjustments([rule], entries, NOW);

    expect(result).toEqual([
      {
        ruleId: "rule-1",
        title: "朝会",
        timezone: TZ,
        changed: true,
        previousStartTime: "09:00",
        previousEndTime: "09:30",
        newStartTime: "09:15",
        newEndTime: "10:00",
      },
    ]);
  });
});

describe("computeRuleAdjustments(T2)", () => {
  it("T2: 紐づく実績が2件のみ Then changed:false(境界値: 最低サンプル数3件)", () => {
    const rule = makeRule();
    const entries = [
      ruleEntry("rule-1", "2026-07-06 10:00", 60),
      ruleEntry("rule-1", "2026-07-13 10:00", 60),
    ];

    const result = computeRuleAdjustments([rule], entries, NOW);

    expect(result).toEqual([
      {
        ruleId: "rule-1",
        title: "朝会",
        timezone: TZ,
        changed: false,
        previousStartTime: "09:00",
        previousEndTime: "09:30",
      },
    ]);
  });
});

describe("computeRuleAdjustments(T3)", () => {
  it("T3: 紐づく実績がちょうど3件で現在値と一致 Then 計算は実行されchanged:falseが返る(境界値: 最低サンプル数の境界そのもの)", () => {
    const rule = makeRule({ startTime: "09:00", endTime: "09:30" });
    const entries = [
      ruleEntry("rule-1", "2026-07-06 09:00", 30),
      ruleEntry("rule-1", "2026-07-13 09:00", 30),
      ruleEntry("rule-1", "2026-07-20 09:00", 30),
    ];

    const result = computeRuleAdjustments([rule], entries, NOW);

    expect(result).toEqual([
      {
        ruleId: "rule-1",
        title: "朝会",
        timezone: TZ,
        changed: false,
        previousStartTime: "09:00",
        previousEndTime: "09:30",
      },
    ]);
  });
});

describe("computeRuleAdjustments(T4)", () => {
  it("T4: 新旧の差がいずれも15分未満 Then changed:false(境界値: 丸め単位未満の差は無視)", () => {
    // 丸め後の新しい値は必ず15分刻みになるため、15分未満の差を作るには
    // 現在の登録値自体を15分刻みでない値にする(手動編集等で起こりうる値として検証)
    const rule = makeRule({ startTime: "09:07", endTime: "09:37" });
    const entries = [
      ruleEntry("rule-1", "2026-07-06 09:15", 30),
      ruleEntry("rule-1", "2026-07-13 09:15", 30),
      ruleEntry("rule-1", "2026-07-20 09:15", 30),
    ];

    const result = computeRuleAdjustments([rule], entries, NOW);

    // 開始: 09:07(547分)→ 中央値丸め後09:15(555分)。差8分 <15分
    // 所要: 30分→丸め後30分。差0分 <15分 → どちらも無視されchanged:false
    expect(result).toEqual([
      {
        ruleId: "rule-1",
        title: "朝会",
        timezone: TZ,
        changed: false,
        previousStartTime: "09:07",
        previousEndTime: "09:37",
      },
    ]);
  });
});

describe("computeRuleAdjustments(T5)", () => {
  it("T5: 新旧の差がちょうど15分 Then changed:true(境界値)", () => {
    const rule = makeRule({ startTime: "09:00", endTime: "09:30" });
    const entries = [
      ruleEntry("rule-1", "2026-07-06 09:15", 30),
      ruleEntry("rule-1", "2026-07-13 09:15", 30),
      ruleEntry("rule-1", "2026-07-20 09:15", 30),
    ];

    const result = computeRuleAdjustments([rule], entries, NOW);

    expect(result[0]).toMatchObject({
      changed: true,
      newStartTime: "09:15",
      newEndTime: "09:45",
    });
  });
});

describe("computeRuleAdjustments(T6)", () => {
  it("T6: 丸め後の終了時刻が24:00を超える Then changed:false(日またぎ不可。FR-12と同じ制約)", () => {
    const rule = makeRule({ startTime: "23:00", endTime: "23:20" });
    const entries = [
      ruleEntry("rule-1", "2026-07-06 23:50", 60),
      ruleEntry("rule-1", "2026-07-13 23:50", 60),
      ruleEntry("rule-1", "2026-07-20 23:50", 60),
    ];

    const result = computeRuleAdjustments([rule], entries, NOW);

    expect(result).toEqual([
      {
        ruleId: "rule-1",
        title: "朝会",
        timezone: TZ,
        changed: false,
        previousStartTime: "23:00",
        previousEndTime: "23:20",
      },
    ]);
  });
});

describe("computeRuleAdjustments(T7)", () => {
  it("T7: last_learned_atが7日未満前 Then 対象から除外され結果に含まれない(境界値: 再学習間隔)", () => {
    const rule = makeRule({ lastLearnedAt: isoDaysBefore(NOW, 3) });
    const entries = [
      ruleEntry("rule-1", "2026-07-06 09:15", 45),
      ruleEntry("rule-1", "2026-07-13 09:15", 45),
      ruleEntry("rule-1", "2026-07-20 09:15", 45),
    ];

    const result = computeRuleAdjustments([rule], entries, NOW);

    expect(result).toHaveLength(0);
  });
});

describe("computeRuleAdjustments(T8)", () => {
  it("T8: last_learned_atがnull、または7日以上前 Then 対象に含まれる", () => {
    const ruleNull = makeRule({ id: "rule-null", lastLearnedAt: null });
    const ruleWeekAgo = makeRule({
      id: "rule-week-ago",
      lastLearnedAt: isoDaysBefore(NOW, 7),
    });

    const result = computeRuleAdjustments([ruleNull, ruleWeekAgo], [], NOW);

    expect(result.map((r) => r.ruleId).sort()).toEqual([
      "rule-null",
      "rule-week-ago",
    ]);
  });
});

describe("computeRuleAdjustments(T9)", () => {
  it("T9: origin='manual'のルール Then 対象外(誤って渡されても処理しない)", () => {
    const rule = makeRule({ origin: "manual" });
    const entries = [
      ruleEntry("rule-1", "2026-07-06 09:15", 45),
      ruleEntry("rule-1", "2026-07-13 09:15", 45),
      ruleEntry("rule-1", "2026-07-20 09:15", 45),
    ];

    const result = computeRuleAdjustments([rule], entries, NOW);

    expect(result).toHaveLength(0);
  });
});

describe("computeRuleAdjustments(T10)", () => {
  it("T10: UTC保存の実績がルールのタイムゾーンで日をまたぐ時刻 Then 正しいローカル開始時刻で中央値が計算される(タイムゾーン)", () => {
    // Pacific/Kiritimati(UTC+14)。UTCでは前日昼だがローカルでは当日09:15になる時刻を使う
    const KIRITIMATI = "Pacific/Kiritimati";
    const rule = makeRule({
      timezone: KIRITIMATI,
      startTime: "09:00",
      endTime: "09:30",
    });
    const entries = [
      ruleEntry("rule-1", "2026-07-06 09:15", 45, KIRITIMATI),
      ruleEntry("rule-1", "2026-07-13 09:15", 45, KIRITIMATI),
      ruleEntry("rule-1", "2026-07-20 09:15", 45, KIRITIMATI),
    ];

    const result = computeRuleAdjustments([rule], entries, NOW);

    expect(result[0]).toMatchObject({
      changed: true,
      newStartTime: "09:15",
      newEndTime: "10:00",
    });
  });
});

describe("computeRuleAdjustments(T11)", () => {
  it("T11: google_event_idが対象ルール以外の実績 Then 計算対象に含まれない", () => {
    const rule = makeRule();
    const entries: TimeEntryItem[] = [
      ruleEntry("rule-1", "2026-07-06 09:15", 45), // 対象
      ruleEntry("rule-1", "2026-07-13 09:15", 45), // 対象
      ruleEntry("other-rule", "2026-07-13 09:15", 45), // 別ルール
      {
        id: "app-entry",
        title: "アプリ内予定",
        googleEventId: "app:xxxx",
        startAt: ruleEntry("rule-1", "2026-07-20 09:15", 45).startAt,
        endAt: ruleEntry("rule-1", "2026-07-20 09:15", 45).endAt,
      },
      {
        id: "free-entry",
        title: "フリータイマー",
        googleEventId: null,
        startAt: ruleEntry("rule-1", "2026-07-27 09:15", 45).startAt,
        endAt: ruleEntry("rule-1", "2026-07-27 09:15", 45).endAt,
      },
    ];

    const result = computeRuleAdjustments([rule], entries, NOW);

    // 有効なのは "rule-1" 紐づきの2件のみ → サンプル不足でchanged:false
    expect(result).toEqual([
      {
        ruleId: "rule-1",
        title: "朝会",
        timezone: TZ,
        changed: false,
        previousStartTime: "09:00",
        previousEndTime: "09:30",
      },
    ]);
  });
});

describe("computeRuleAdjustments(T12)", () => {
  it("T12: 調整対象が複数ルール Then それぞれ独立して判定される", () => {
    const ruleA = makeRule({ id: "rule-a", title: "朝会" });
    const ruleB = makeRule({
      id: "rule-b",
      title: "夕会",
      startTime: "18:00",
      endTime: "18:30",
    });
    const entries = [
      // rule-a: サンプル不足(2件)
      ruleEntry("rule-a", "2026-07-06 09:00", 30),
      ruleEntry("rule-a", "2026-07-13 09:00", 30),
      // rule-b: 3件・15分ずれる
      ruleEntry("rule-b", "2026-07-06 18:15", 30),
      ruleEntry("rule-b", "2026-07-13 18:15", 30),
      ruleEntry("rule-b", "2026-07-20 18:15", 30),
    ];

    const result = computeRuleAdjustments([ruleA, ruleB], entries, NOW);

    expect(result).toEqual([
      {
        ruleId: "rule-a",
        title: "朝会",
        timezone: TZ,
        changed: false,
        previousStartTime: "09:00",
        previousEndTime: "09:30",
      },
      {
        ruleId: "rule-b",
        title: "夕会",
        timezone: TZ,
        changed: true,
        previousStartTime: "18:00",
        previousEndTime: "18:30",
        newStartTime: "18:15",
        newEndTime: "18:45",
      },
    ]);
  });
});
