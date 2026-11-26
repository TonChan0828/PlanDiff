import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { materializeRecurringInstances } from "@/lib/calendar/recurring";
import type { RecurringRuleSummary } from "@/lib/calendar/recurring-id";

// 仕様書: docs/specs/G-112_カレンダー表示と定期予定更新処理の境界.md B8・B10(割り込みの全位置)
// 調整直後の再実体化(上書きあり)の途中に、別リクエストが「調整前の時刻」の行を挿入のみで入れる。
// どの操作の直前に割り込んでも、最終的に新しい時刻にそろうことを、メモリ上の表で網羅的に確かめる。

const RANGE = {
  timeMin: "2026-03-10T00:00:00.000Z",
  timeMax: "2026-03-13T00:00:00.000Z",
};
const BASE_DATE = new Date(Date.UTC(2026, 2, 10, 12, 0));
const FROM = new Date(Date.UTC(2026, 2, 9, 0, 0));
const DATES = ["2026-03-10", "2026-03-11", "2026-03-12"];
const OLD_START = "T00:00:00.000Z"; // 09:00 JST
const NEW_START = "T00:15:00.000Z"; // 09:15 JST

const NEW_RULE: RecurringRuleSummary = {
  id: "rule-1",
  title: "朝会",
  pattern: "daily",
  weekdays: null,
  startTime: "09:15",
  endTime: "10:00",
  timezone: "Asia/Tokyo",
  startsOn: "2026-01-01",
  endsOn: null,
  origin: "manual",
  lastLearnedAt: null,
  autoAdjustEnabled: true,
};

interface Row {
  google_event_id: string;
  start_at: string;
}

/** interleaveAt 番目の synced_events への操作の直前に、別リクエストの古い行の挿入を割り込ませる */
function createStore(interleaveAt: number) {
  const table = new Map<string, Row>();
  let operations = 0;
  const upsertRows = (rows: Row[], ignoreDuplicates: boolean) => {
    for (const row of rows) {
      if (ignoreDuplicates && table.has(row.google_event_id)) continue;
      table.set(row.google_event_id, { ...row });
    }
  };
  const beforeOperation = () => {
    if (operations === interleaveAt) {
      upsertRows(
        DATES.map((date) => ({
          google_event_id: `rec:rule-1:${date}`,
          start_at: `${date}${OLD_START}`,
        })),
        true,
      );
    }
    operations += 1;
  };

  const from = vi.fn((name: string) => {
    if (name === "recurring_exceptions") {
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "in", "gte", "lte", "order"]) {
        builder[method] = () => builder;
      }
      builder.range = () => Promise.resolve({ data: [], error: null });
      return builder;
    }
    return {
      select: () => {
        let ids: string[] = [];
        const builder: Record<string, unknown> = {};
        builder.eq = () => builder;
        builder.in = (_column: string, value: string[]) => {
          ids = value;
          return builder;
        };
        builder.gte = (_column: string, value: string) => {
          beforeOperation();
          const data = ids
            .map((id) => table.get(id))
            .filter((row): row is Row => !!row && row.start_at >= value)
            .map((row) => ({ google_event_id: row.google_event_id }));
          return Promise.resolve({ data, error: null });
        };
        return builder;
      },
      upsert: (rows: Row[], options: { ignoreDuplicates: boolean }) => {
        beforeOperation();
        upsertRows(rows, options.ignoreDuplicates);
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
  return { client, table };
}

describe("調整直後の再実体化と、別リクエストの古い行の挿入の交錯(G-112)", () => {
  // 0 = 最初の操作の直前、…、3 = 全操作のあと(割り込みなしと同じ最終状態になるべき)
  it.each([0, 1, 2, 3])(
    "synced_events への %i 番目の操作の直前に割り込まれても、新しい時刻にそろう",
    async (interleaveAt) => {
      const { client, table } = createStore(interleaveAt);

      await materializeRecurringInstances(
        client,
        BASE_DATE,
        RANGE,
        [NEW_RULE],
        {
          overwriteRuleIds: ["rule-1"],
          overwriteFrom: FROM,
        },
      );

      expect([...table.values()].map((row) => row.start_at).sort()).toEqual(
        DATES.map((date) => `${date}${NEW_START}`),
      );
    },
  );
});
