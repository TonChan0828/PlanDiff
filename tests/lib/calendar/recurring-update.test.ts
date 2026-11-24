import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  updateRecurringRule,
  type RecurringRuleFormInput,
} from "@/lib/calendar/recurring";

// 仕様書: docs/specs/G-108_定期予定編集のトランザクション化.md T9・T10

const RULE_ID = "11111111-1111-4111-8111-111111111111";

const INPUT: RecurringRuleFormInput = {
  title: "朝会",
  pattern: "daily",
  weekdays: null,
  startTime: "09:00",
  endTime: "09:30",
  timezone: "UTC",
  startsOn: "2026-01-01",
  endsOn: null,
};

function fakeClient(rpcResult: {
  data: unknown;
  error: { message: string } | null;
}) {
  const rpc = vi.fn().mockResolvedValue(rpcResult);
  const from = vi.fn();
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
    },
    rpc,
    from,
  } as unknown as SupabaseClient;
  return { client, rpc, from };
}

beforeEach(() => {
  // 「今日」の境界をローカルTZに依存させない(R-1)。UTC正午に固定する
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(Date.UTC(2026, 10, 24, 12, 0)));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("updateRecurringRule はDB関数1回で更新を確定する(G-108)", () => {
  it("T9: DB関数がエラーを返したら失敗を返す(握りつぶさない)", async () => {
    const { client } = fakeClient({ data: null, error: { message: "boom" } });

    const result = await updateRecurringRule(client, RULE_ID, INPUT);

    expect(result.ok).toBe(false);
  });

  it("T9: DB関数が false(対象なし)を返したら失敗を返す", async () => {
    const { client } = fakeClient({ data: false, error: null });

    const result = await updateRecurringRule(client, RULE_ID, INPUT);

    expect(result.ok).toBe(false);
  });

  it("成功時はルールの値と今日の境界をDB関数へ渡し、テーブルを直接操作しない", async () => {
    const { client, rpc, from } = fakeClient({ data: true, error: null });

    const result = await updateRecurringRule(client, RULE_ID, INPUT);

    expect(result.ok).toBe(true);
    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("update_recurring_rule", {
      p_rule_id: RULE_ID,
      p_title: "朝会",
      p_pattern: "daily",
      p_weekdays: null,
      p_start_time: "09:00",
      p_end_time: "09:30",
      p_timezone: "UTC",
      p_starts_on: "2026-01-01",
      p_ends_on: null,
      p_threshold: "2026-11-24T00:00:00.000Z",
      p_today: "2026-11-24",
    });
  });

  it("今日の境界はルールのタイムゾーンで求める(JSTでは前日の日付になる時刻)", async () => {
    vi.setSystemTime(new Date(Date.UTC(2026, 10, 24, 16, 0))); // JST 11/25 01:00
    const { client, rpc } = fakeClient({ data: true, error: null });

    await updateRecurringRule(client, RULE_ID, {
      ...INPUT,
      timezone: "Asia/Tokyo",
    });

    const args = rpc.mock.calls[0]![1] as Record<string, string>;
    expect(args.p_today).toBe("2026-11-25");
    expect(args.p_threshold).toBe("2026-11-24T15:00:00.000Z");
  });

  it("T10: 不正な入力(空のタイトル)はDB関数を呼ばずに失敗を返す", async () => {
    const { client, rpc } = fakeClient({ data: true, error: null });

    const result = await updateRecurringRule(client, RULE_ID, {
      ...INPUT,
      title: "",
    });

    expect(result.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("T10: 不正なルールidはDB関数を呼ばずに失敗を返す", async () => {
    const { client, rpc } = fakeClient({ data: true, error: null });

    const result = await updateRecurringRule(client, "not-an-id", INPUT);

    expect(result.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});
