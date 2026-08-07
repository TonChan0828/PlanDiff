import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { materializeRecurringInstances } from "@/lib/calendar/recurring";

// 仕様書: docs/specs/P6-1_サーバー往復の集約.md S5〜S8

interface RuleRow {
  id: string;
  title: string;
  pattern: "daily" | "weekly" | "weekdays";
  weekdays: number[] | null;
  start_time: string;
  end_time: string;
  timezone: string;
  starts_on: string;
  ends_on: string | null;
}

function ruleRow(overrides: Partial<RuleRow> = {}): RuleRow {
  return {
    id: "rule-1",
    title: "朝会",
    pattern: "daily",
    weekdays: null,
    start_time: "09:00:00",
    end_time: "09:30:00",
    timezone: "Asia/Tokyo",
    starts_on: "2026-01-01",
    ends_on: null,
    ...overrides,
  };
}

interface MaterializeMockOptions {
  rules?: RuleRow[];
  rulesError?: boolean;
  exceptions?: { rule_id: string; occurrence_date: string }[];
}

function createMaterializeMock(options: MaterializeMockOptions = {}) {
  const exceptionFilters: Record<string, unknown> = {};
  const upserted: Record<string, unknown>[][] = [];

  const from = vi.fn((table: string) => {
    if (table === "recurring_rules") {
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.order = () =>
        Promise.resolve({
          data: options.rulesError ? null : (options.rules ?? []),
          error: options.rulesError ? { message: "rules failed" } : null,
        });
      // order を付けない実装でも await できるようにしておく
      builder.then = (resolve: (value: unknown) => unknown) =>
        resolve({
          data: options.rulesError ? null : (options.rules ?? []),
          error: options.rulesError ? { message: "rules failed" } : null,
        });
      return builder;
    }
    if (table === "recurring_exceptions") {
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.in = (column: string, value: unknown) => {
        exceptionFilters[`in:${column}`] = value;
        return builder;
      };
      builder.gte = (column: string, value: unknown) => {
        exceptionFilters[`gte:${column}`] = value;
        return builder;
      };
      builder.lt = (column: string, value: unknown) => {
        exceptionFilters[`lt:${column}`] = value;
        return builder;
      };
      builder.lte = (column: string, value: unknown) => {
        exceptionFilters[`lte:${column}`] = value;
        return builder;
      };
      builder.then = (resolve: (value: unknown) => unknown) =>
        resolve({ data: options.exceptions ?? [], error: null });
      return builder;
    }
    return {
      upsert: (rows: Record<string, unknown>[]) => {
        upserted.push(rows);
        return Promise.resolve({ error: null });
      },
    };
  });

  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      }),
    },
    from,
  } as unknown as SupabaseClient;

  return { client, exceptionFilters, upserted };
}

const RANGE = {
  timeMin: "2026-03-10T00:00:00.000Z",
  timeMax: "2026-03-17T00:00:00.000Z",
};

describe("materializeRecurringInstances の例外取得(S5・S6)", () => {
  it("S5: recurring_exceptions の取得に occurrence_date の期間フィルタが適用される", async () => {
    const { client, exceptionFilters } = createMaterializeMock({
      rules: [ruleRow()],
    });

    await materializeRecurringInstances(client, new Date(RANGE.timeMin), RANGE);

    expect(exceptionFilters["in:rule_id"]).toEqual(["rule-1"]);
    // 前後1日のバッファを含む範囲であること
    expect(exceptionFilters["gte:occurrence_date"]).toBe("2026-03-09");
    expect(exceptionFilters["lte:occurrence_date"]).toBe("2026-03-18");
  });

  it("S6: 範囲の端日の例外もバッファに含まれ、除外として反映される", async () => {
    // 範囲初日(2026-03-10)の回を例外にする
    const { client, upserted } = createMaterializeMock({
      rules: [ruleRow()],
      exceptions: [{ rule_id: "rule-1", occurrence_date: "2026-03-10" }],
    });

    await materializeRecurringInstances(client, new Date(RANGE.timeMin), RANGE);

    const rows = upserted[0] ?? [];
    const ids = rows.map((row) => row.google_event_id as string);
    expect(ids).not.toContain("rec:rule-1:2026-03-10");
    // 例外にしていない日は実体化される
    expect(ids).toContain("rec:rule-1:2026-03-11");
  });
});

describe("materializeRecurringInstances の戻り値(S7・S8)", () => {
  it("S7: ルール一覧を fetchRecurringRules と同じ形(HH:mm正規化済み)で返す", async () => {
    const { client } = createMaterializeMock({
      rules: [
        ruleRow(),
        ruleRow({
          id: "rule-2",
          title: "レビュー",
          pattern: "weekly",
          weekdays: [1, 3],
          start_time: "13:00:00",
          end_time: "14:00:00",
          ends_on: "2026-12-31",
        }),
      ],
    });

    const result = await materializeRecurringInstances(
      client,
      new Date(RANGE.timeMin),
      RANGE,
    );

    expect(result).toEqual([
      {
        id: "rule-1",
        title: "朝会",
        pattern: "daily",
        weekdays: null,
        startTime: "09:00",
        endTime: "09:30",
        timezone: "Asia/Tokyo",
        startsOn: "2026-01-01",
        endsOn: null,
      },
      {
        id: "rule-2",
        title: "レビュー",
        pattern: "weekly",
        weekdays: [1, 3],
        startTime: "13:00",
        endTime: "14:00",
        timezone: "Asia/Tokyo",
        startsOn: "2026-01-01",
        endsOn: "2026-12-31",
      },
    ]);
  });

  it("S8: recurring_rules の取得が失敗しても空配列を返し、例外を投げない", async () => {
    const { client } = createMaterializeMock({ rulesError: true });

    await expect(
      materializeRecurringInstances(client, new Date(RANGE.timeMin), RANGE),
    ).resolves.toEqual([]);
  });

  it("S8: ルールが0件なら空配列を返す", async () => {
    const { client } = createMaterializeMock({ rules: [] });

    await expect(
      materializeRecurringInstances(client, new Date(RANGE.timeMin), RANGE),
    ).resolves.toEqual([]);
  });
});
