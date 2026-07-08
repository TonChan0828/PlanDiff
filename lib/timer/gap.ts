import { differenceInMinutes, parseISO } from "date-fns";

// 予定と実績のズレ計算(P3-1)。紐づき判定と開始遅延・超過時間を求める純粋関数。
// 早期開始・早期終了はスコープ外(仕様書 docs/specs/P3-1_オーバーレイ表示.md 参照)。

export interface ActualGapInput {
  id: string;
  googleEventId: string | null;
  /** UTCのISO文字列 */
  startAt: string;
  /** UTCのISO文字列 */
  endAt: string;
}

export interface PlanEventForGap {
  googleEventId: string;
  /** UTCのISO文字列 */
  startAt: string;
  /** UTCのISO文字列 */
  endAt: string;
}

export interface ActualGapInfo {
  linked: boolean;
  startDelayMinutes: number;
  overrunMinutes: number;
}

const NO_GAP: ActualGapInfo = {
  linked: false,
  startDelayMinutes: 0,
  overrunMinutes: 0,
};

export function computeActualGaps(
  actuals: ActualGapInput[],
  planEvents: PlanEventForGap[],
): Map<string, ActualGapInfo> {
  const planByEventId = new Map<string, PlanEventForGap>();
  for (const event of planEvents) {
    if (!planByEventId.has(event.googleEventId)) {
      planByEventId.set(event.googleEventId, event);
    }
  }

  const groups = new Map<string, ActualGapInput[]>();
  const result = new Map<string, ActualGapInfo>();

  for (const entry of actuals) {
    const plan = entry.googleEventId
      ? planByEventId.get(entry.googleEventId)
      : undefined;
    if (!plan) {
      result.set(entry.id, NO_GAP);
      continue;
    }
    const group = groups.get(entry.googleEventId!) ?? [];
    group.push(entry);
    groups.set(entry.googleEventId!, group);
  }

  for (const [googleEventId, group] of groups) {
    const plan = planByEventId.get(googleEventId)!;
    const sorted = [...group].sort(
      (a, b) => parseISO(a.startAt).getTime() - parseISO(b.startAt).getTime(),
    );
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    for (const entry of sorted) {
      const startDelayMinutes =
        entry === first
          ? Math.max(
              0,
              differenceInMinutes(
                parseISO(entry.startAt),
                parseISO(plan.startAt),
              ),
            )
          : 0;
      const overrunMinutes =
        entry === last
          ? Math.max(
              0,
              differenceInMinutes(parseISO(entry.endAt), parseISO(plan.endAt)),
            )
          : 0;
      result.set(entry.id, {
        linked: true,
        startDelayMinutes,
        overrunMinutes,
      });
    }
  }

  return result;
}
