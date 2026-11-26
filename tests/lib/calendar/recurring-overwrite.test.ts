import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { materializeRecurringInstances } from "@/lib/calendar/recurring";

// 仕様書: docs/specs/G-112_カレンダー表示と定期予定更新処理の境界.md(上書きオプション。B10・B13・B14 の単体側)
// どの行を ignoreDuplicates:false(上書き)で送り、どの行を ignoreDuplicates:true(挿入のみ)で送るかを、
// DB を使わずに固定する。DB を通した整合は結合テスト(tests/integration/recurring-sync.test.ts)で確認する。

const RANGE = {
  timeMin: "2026-03-10T00:00:00.000Z",
  timeMax: "2026-03-13T00:00:00.000Z",
};
const BASE_DATE = new Date(Date.UTC(2026, 2, 10, 12, 0));
const OVERWRITE_FROM = new Date(Date.UTC(2026, 2, 11, 0, 0));

const RULE_ROW = {
  id: "rule-1",
  title: "朝会",
  pattern: "daily",
  weekdays: null,
  start_time: "09:00:00",
  end_time: "09:30:00",
  timezone: "Asia/Tokyo",
  starts_on: "2026-01-01",
  ends_on: null,
};

interface UpsertCall {
  ids: string[];
  ignoreDuplicates: boolean;
}

interface MockOptions {
  /** 既存行の確認(select)が返す google_event_id。省略時は空 */
  existingIds?: string[];
  existingError?: boolean;
  /** upsert を失敗させる ignoreDuplicates の値 */
  failUpsertWhenIgnoreDuplicates?: boolean;
}

function createClient(options: MockOptions = {}) {
  const upserts: UpsertCall[] = [];
  const existingQueries: { ids: unknown; gte: unknown }[] = [];

  const from = vi.fn((table: string) => {
    if (table === "recurring_rules") {
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.order = () => Promise.resolve({ data: [RULE_ROW], error: null });
      return builder;
    }
    if (table === "recurring_exceptions") {
      const builder: Record<string, unknown> = {};
      for (const name of ["select", "in", "gte", "lte", "order"]) {
        builder[name] = () => builder;
      }
      builder.range = () => Promise.resolve({ data: [], error: null });
      return builder;
    }
    // synced_events
    return {
      select: () => {
        const query: { ids?: unknown; gte?: unknown } = {};
        const builder: Record<string, unknown> = {};
        builder.eq = () => builder;
        builder.in = (_column: string, value: unknown) => {
          query.ids = value;
          return builder;
        };
        builder.gte = (_column: string, value: unknown) => {
          query.gte = value;
          existingQueries.push({ ids: query.ids, gte: query.gte });
          return Promise.resolve(
            options.existingError
              ? { data: null, error: { message: "select failed" } }
              : {
                  data: (options.existingIds ?? []).map((id) => ({
                    google_event_id: id,
                  })),
                  error: null,
                },
          );
        };
        return builder;
      },
      upsert: (
        rows: { google_event_id: string }[],
        upsertOptions: { ignoreDuplicates: boolean },
      ) => {
        upserts.push({
          ids: rows.map((row) => row.google_event_id),
          ignoreDuplicates: upsertOptions.ignoreDuplicates,
        });
        const failed =
          options.failUpsertWhenIgnoreDuplicates ===
          upsertOptions.ignoreDuplicates;
        return Promise.resolve({
          error: failed ? { message: "upsert failed" } : null,
        });
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
  return { client, upserts, existingQueries };
}

const id = (date: string) => `rec:rule-1:${date}`;
const ALL_IDS = [id("2026-03-10"), id("2026-03-11"), id("2026-03-12")];

async function materialize(
  client: SupabaseClient,
  options?: { overwriteRuleIds?: string[]; overwriteFrom?: Date },
) {
  return materializeRecurringInstances(
    client,
    BASE_DATE,
    RANGE,
    undefined,
    options,
  );
}

describe("materializeRecurringInstances の上書きオプション(G-112)", () => {
  it("オプションを省略すると、既存行を確認せず、挿入のみの upsert を1回だけ送る(従来どおり)", async () => {
    const { client, upserts, existingQueries } = createClient();

    await materialize(client);

    expect(existingQueries).toEqual([]);
    expect(upserts).toEqual([{ ids: ALL_IDS, ignoreDuplicates: true }]);
  });

  it("対象ルールの行がなければ(別のルールid)、既存行を確認しない", async () => {
    const { client, upserts, existingQueries } = createClient();

    await materialize(client, {
      overwriteRuleIds: ["other-rule"],
      overwriteFrom: OVERWRITE_FROM,
    });

    expect(existingQueries).toEqual([]);
    expect(upserts).toEqual([{ ids: ALL_IDS, ignoreDuplicates: true }]);
  });

  it("全行を挿入のみで送ったあと、既存行として返った id だけを上書きする", async () => {
    const { client, upserts, existingQueries } = createClient({
      existingIds: [id("2026-03-11"), id("2026-03-12")],
    });

    await materialize(client, {
      overwriteRuleIds: ["rule-1"],
      overwriteFrom: OVERWRITE_FROM,
    });

    // 既存行の確認は、候補の id と、overwriteFrom 以降という条件で行う
    expect(existingQueries).toEqual([
      { ids: ALL_IDS, gte: OVERWRITE_FROM.toISOString() },
    ]);
    expect(upserts).toEqual([
      // 先に全行を挿入のみで書く(確認との間に他の挿入が入っても漏れないようにする)
      { ids: ALL_IDS, ignoreDuplicates: true },
      { ids: [id("2026-03-11"), id("2026-03-12")], ignoreDuplicates: false },
    ]);
  });

  it("既存行が1件もなければ(開始済みの回のみ)、上書きせず挿入のみで送る", async () => {
    const { client, upserts } = createClient({ existingIds: [] });

    await materialize(client, {
      overwriteRuleIds: ["rule-1"],
      overwriteFrom: OVERWRITE_FROM,
    });

    expect(upserts).toEqual([{ ids: ALL_IDS, ignoreDuplicates: true }]);
  });

  it("異常系: 既存行の確認に失敗したら、上書きせず挿入のみで送り、例外にしない", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client, upserts } = createClient({ existingError: true });

    await expect(
      materialize(client, {
        overwriteRuleIds: ["rule-1"],
        overwriteFrom: OVERWRITE_FROM,
      }),
    ).resolves.toHaveLength(1);

    // 個別編集を消すより、古い時刻が残るほうがよい(安全側)
    expect(upserts).toEqual([{ ids: ALL_IDS, ignoreDuplicates: true }]);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("異常系: 上書き側の upsert が失敗しても、挿入側の結果は保たれ、例外にならない", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client, upserts } = createClient({
      existingIds: [id("2026-03-11")],
      failUpsertWhenIgnoreDuplicates: false,
    });

    await expect(
      materialize(client, {
        overwriteRuleIds: ["rule-1"],
        overwriteFrom: OVERWRITE_FROM,
      }),
    ).resolves.toHaveLength(1);

    // 両方のバッチを試みる。失敗は記録するだけで、もう一方を止めない
    expect(upserts.map((u) => u.ignoreDuplicates)).toEqual([true, false]);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
