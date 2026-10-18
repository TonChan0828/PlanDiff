import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RulePauseSuggestion } from "@/lib/calendar/recurring-id";
import { getSessionUser } from "@/lib/supabase/session-user";

export async function fetchRulePauseSuggestions(
  client: SupabaseClient,
): Promise<RulePauseSuggestion[]> {
  const { data, error } = await client.rpc("get_recurring_pause_suggestions");
  // 読み取り失敗を「未記録」として扱わない。候補の表示だけを省略する。
  if (error) return [];
  return (data ?? []).map(
    (row: {
      rule_id: string;
      title: string;
      timezone: string;
      missed_count: number;
      last_recorded_at: string | null;
    }) => ({
      ruleId: row.rule_id,
      title: row.title,
      timezone: row.timezone,
      missedCount: Number(row.missed_count),
      lastRecordedAt: row.last_recorded_at,
    }),
  );
}

export type RulePauseAction = "pause" | "resume" | "snooze";

export async function setRulePause(
  client: SupabaseClient,
  ruleId: string,
  action: RulePauseAction,
): Promise<{ ok: boolean }> {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      ruleId,
    ) ||
    !["pause", "resume", "snooze"].includes(action) ||
    !(await getSessionUser(client))
  ) {
    return { ok: false };
  }
  const { data, error } = await client.rpc("set_recurring_rule_pause", {
    p_rule_id: ruleId,
    p_action: action,
  });
  return { ok: !error && data === true };
}
