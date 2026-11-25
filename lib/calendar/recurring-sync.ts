import "server-only";
import { materializeRecurringInstances } from "@/lib/calendar/recurring";
import type {
  RecurringRuleSummary,
  RuleAdjustmentNotice,
} from "@/lib/calendar/recurring-id";
import {
  applyRuleAdjustments,
  computeRuleAdjustments,
} from "@/lib/calendar/rule-learning";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import { fetchRuleLearningEntries } from "@/lib/timer/entries";

// カレンダー表示の前に行う、定期予定の書き込みの手順(G-112)。
// 仕様書: docs/specs/G-112_カレンダー表示と定期予定更新処理の境界.md

export interface PrepareRecurringEventsOptions {
  /** 実体化する範囲の基準日(表示中の週) */
  baseDate: Date;
  now: Date;
  /**
   * 自動調整(書き込み)を行ってよいか。実体化の後に判明する条件(オンボーディング済み)を
   * 並列で待てるように Promise で受ける。false なら調整せず、実体化の結果だけを返す。
   */
  canAdjust?: Promise<boolean>;
}

export interface PreparedRecurringEvents {
  recurringRules: RecurringRuleSummary[];
  /** 実際に変更が適用された調整の通知データ */
  ruleAdjustments: RuleAdjustmentNotice[];
}

/**
 * 定期予定を画面に出せる状態にする。書き込みの順序は次のとおり:
 * 1. 実体化(冪等。失敗しても既存の表示は続く)
 * 2. 自動調整(ルールごとに独立。RPC が前回値の一致を確認するため、同時表示でも二重に適用されない)
 * 3. 調整があったルールだけを再実体化
 */
export async function prepareRecurringEvents(
  client: AppSupabaseClient,
  { baseDate, now, canAdjust }: PrepareRecurringEventsOptions,
): Promise<PreparedRecurringEvents> {
  const recurringRules = await materializeRecurringInstances(client, baseDate);

  if (
    (canAdjust && !(await canAdjust)) ||
    !hasAutoAdjustRules(recurringRules)
  ) {
    return { recurringRules, ruleAdjustments: [] };
  }
  const ruleAdjustments = await applyRuleAdjustments(
    client,
    computeRuleAdjustments(
      recurringRules,
      await fetchRuleLearningEntries(client, now),
      now,
    ),
    now,
  );
  if (ruleAdjustments.length === 0) {
    return { recurringRules, ruleAdjustments };
  }
  return {
    recurringRules: await rematerializeAdjustedRules(client, {
      baseDate,
      now,
      rules: recurringRules,
      adjustments: ruleAdjustments,
    }),
    ruleAdjustments,
  };
}

function hasAutoAdjustRules(rules: RecurringRuleSummary[]): boolean {
  return rules.some((rule) => rule.autoAdjustEnabled);
}

interface RematerializeOptions {
  baseDate: Date;
  now: Date;
  /** 調整前に取得したルール一覧 */
  rules: RecurringRuleSummary[];
  adjustments: RuleAdjustmentNotice[];
}

/**
 * 調整結果をマージしたルールで再実体化し、マージ後のルール一覧を返す。再実体化の失敗は例外にしない。
 * ルールは DB から読み直さない: Next.js の fetch メモ化により、同一レンダー内の同じ SELECT は
 * 更新前の内容を返してしまうため、既知のルール一覧に調整結果を反映して渡す。
 */
export async function rematerializeAdjustedRules(
  client: AppSupabaseClient,
  { baseDate, now, rules, adjustments }: RematerializeOptions,
): Promise<RecurringRuleSummary[]> {
  const merged = rules.map((rule) => {
    const notice = adjustments.find((n) => n.ruleId === rule.id);
    return notice
      ? {
          ...rule,
          startTime: notice.newStartTime,
          endTime: notice.newEndTime,
          lastLearnedAt: now.toISOString(),
        }
      : rule;
  });
  // 同時に表示した別リクエストが、調整前のルールで古い時刻の行を入れ直すことがある(調整の削除と交錯した場合)。
  // 実体化は既存の行を上書きしない(ignoreDuplicates)ため、そのままでは古い時刻が残る。
  // 調整したルールの今日以降の行だけは、ルール由来の値なので上書きして整える。過去の行には触れない。
  try {
    await materializeRecurringInstances(client, baseDate, undefined, merged, {
      overwriteRuleIds: adjustments.map((notice) => notice.ruleId),
      overwriteFrom: now,
    });
  } catch (error) {
    // 再実体化に失敗しても、調整済みのルールと通知は維持する(調整はすでにDBへ確定している)。
    // 今日以降の予定は、次の表示で実体化される。ページ全体は落とさない
    console.error("調整後の定期予定の再実体化に失敗しました", error);
  }
  return merged;
}
