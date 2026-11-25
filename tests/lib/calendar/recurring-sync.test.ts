import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  RecurringRuleSummary,
  RuleAdjustmentNotice,
} from "@/lib/calendar/recurring-id";

// 仕様書: docs/specs/G-112_カレンダー表示と定期予定更新処理の境界.md B1〜B6
// 書き込みの順序と、失敗時の扱いを、モックの呼び出しで固定する。DBを通す整合は結合テストで確認する。

vi.mock("@/lib/calendar/recurring", () => ({
  materializeRecurringInstances: vi.fn(),
}));
vi.mock("@/lib/calendar/rule-learning", () => ({
  computeRuleAdjustments: vi.fn(),
  applyRuleAdjustments: vi.fn(),
}));
vi.mock("@/lib/timer/entries", () => ({ fetchRuleLearningEntries: vi.fn() }));

import { materializeRecurringInstances } from "@/lib/calendar/recurring";
import { prepareRecurringEvents } from "@/lib/calendar/recurring-sync";
import {
  applyRuleAdjustments,
  computeRuleAdjustments,
} from "@/lib/calendar/rule-learning";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import { fetchRuleLearningEntries } from "@/lib/timer/entries";

const materialize = vi.mocked(materializeRecurringInstances);
const compute = vi.mocked(computeRuleAdjustments);
const apply = vi.mocked(applyRuleAdjustments);
const fetchEntries = vi.mocked(fetchRuleLearningEntries);

const client = {} as AppSupabaseClient;
const baseDate = new Date(2026, 10, 24, 12, 0);
const now = new Date(2026, 10, 24, 12, 30);

function rule(
  id: string,
  overrides: Partial<RecurringRuleSummary> = {},
): RecurringRuleSummary {
  return {
    id,
    title: `ルール${id}`,
    pattern: "daily",
    weekdays: null,
    startTime: "09:00",
    endTime: "09:30",
    timezone: "Asia/Tokyo",
    startsOn: "2026-01-01",
    endsOn: null,
    origin: "manual",
    lastLearnedAt: null,
    autoAdjustEnabled: true,
    ...overrides,
  };
}

function notice(ruleId: string): RuleAdjustmentNotice {
  return {
    ruleId,
    title: `ルール${ruleId}`,
    timezone: "Asia/Tokyo",
    previousStartTime: "09:00",
    previousEndTime: "09:30",
    newStartTime: "09:15",
    newEndTime: "10:00",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchEntries.mockResolvedValue([]);
  compute.mockReturnValue([]);
  apply.mockResolvedValue([]);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("prepareRecurringEvents(G-112)", () => {
  it("B1: 自動調整が有効なルールがなければ、実績の取得も調整もしない", async () => {
    const rules = [rule("r1", { autoAdjustEnabled: false })];
    materialize.mockResolvedValue(rules);

    const result = await prepareRecurringEvents(client, { baseDate, now });

    expect(result).toEqual({ recurringRules: rules, ruleAdjustments: [] });
    expect(fetchEntries).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it("B2: 調整が0件なら、再実体化しない(実体化は1回)", async () => {
    const rules = [rule("r1")];
    materialize.mockResolvedValue(rules);
    apply.mockResolvedValue([]);

    const result = await prepareRecurringEvents(client, { baseDate, now });

    expect(materialize).toHaveBeenCalledTimes(1);
    expect(materialize).toHaveBeenCalledWith(client, baseDate);
    expect(result.ruleAdjustments).toEqual([]);
  });

  it("B3: 調整が1件なら、調整結果をマージしたルールで再実体化し、ルールを読み直さない", async () => {
    const rules = [rule("r1"), rule("r2")];
    materialize.mockResolvedValue(rules);
    apply.mockResolvedValue([notice("r1")]);

    const result = await prepareRecurringEvents(client, { baseDate, now });

    expect(materialize).toHaveBeenCalledTimes(2);
    const [, , range, prefetched, options] = materialize.mock.calls[1]!;
    expect(range).toBeUndefined();
    // 調整したルールだけが新しい時刻になり、最終学習日時が now になる。もう一方は変わらない
    expect(prefetched).toEqual([
      {
        ...rules[0],
        startTime: "09:15",
        endTime: "10:00",
        lastLearnedAt: now.toISOString(),
      },
      rules[1],
    ]);
    expect(options).toEqual({ overwriteRuleIds: ["r1"], overwriteFrom: now });
    expect(result.recurringRules).toEqual(prefetched);
    expect(result.ruleAdjustments).toEqual([notice("r1")]);
  });

  it("B4: 一部のルールだけ調整が適用された場合、適用された分だけが通知とマージに入る", async () => {
    const rules = [rule("r1"), rule("r2"), rule("r3")];
    materialize.mockResolvedValue(rules);
    // r2 は RPC が false(別リクエストが先に適用済みなど)で、通知に含まれない
    apply.mockResolvedValue([notice("r1"), notice("r3")]);

    const result = await prepareRecurringEvents(client, { baseDate, now });

    expect(result.ruleAdjustments.map((n) => n.ruleId)).toEqual(["r1", "r3"]);
    expect(result.recurringRules[1]).toEqual(rules[1]);
    expect(result.recurringRules[0]!.startTime).toBe("09:15");
    expect(result.recurringRules[2]!.startTime).toBe("09:15");
  });

  it("B5: 再実体化が失敗しても例外にせず、調整済みのルールと通知を返す", async () => {
    materialize
      .mockResolvedValueOnce([rule("r1")])
      .mockRejectedValueOnce(new Error("network"));
    apply.mockResolvedValue([notice("r1")]);

    const result = await prepareRecurringEvents(client, { baseDate, now });

    expect(result.ruleAdjustments).toEqual([notice("r1")]);
    expect(result.recurringRules[0]!.startTime).toBe("09:15");
    expect(console.error).toHaveBeenCalled();
  });

  it("B6: 実体化 → 実績の取得 → 調整 → 再実体化の順に実行する", async () => {
    const order: string[] = [];
    materialize.mockImplementation(async () => {
      order.push("materialize");
      return [rule("r1")];
    });
    fetchEntries.mockImplementation(async () => {
      order.push("fetchEntries");
      return [];
    });
    apply.mockImplementation(async () => {
      order.push("apply");
      return [notice("r1")];
    });

    await prepareRecurringEvents(client, { baseDate, now });

    expect(order).toEqual([
      "materialize",
      "fetchEntries",
      "apply",
      "materialize",
    ]);
  });

  it("canAdjust が false なら、実体化だけを行い、調整(書き込み)をしない", async () => {
    materialize.mockResolvedValue([rule("r1")]);

    const result = await prepareRecurringEvents(client, {
      baseDate,
      now,
      canAdjust: Promise.resolve(false),
    });

    expect(result.ruleAdjustments).toEqual([]);
    expect(materialize).toHaveBeenCalledTimes(1);
    expect(apply).not.toHaveBeenCalled();
  });

  it("canAdjust が true なら、調整する", async () => {
    materialize.mockResolvedValue([rule("r1")]);
    apply.mockResolvedValue([notice("r1")]);

    const result = await prepareRecurringEvents(client, {
      baseDate,
      now,
      canAdjust: Promise.resolve(true),
    });

    expect(result.ruleAdjustments).toEqual([notice("r1")]);
  });
});
