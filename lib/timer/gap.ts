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

export interface PlanActualDiff {
  /** 最も早い実績の開始 − 予定の開始(分)。正=遅れ・負=早い */
  startDiffMinutes: number;
  /** 同じ予定の実績の合計 − 予定の所要(分)。正=超過・負=不足 */
  durationDiffMinutes: number;
  /** 合計した実績の件数 */
  entryCount: number;
}

/**
 * 実績の編集フォームに出す、予定とのズレ(G-98)。定義はサマリー(P5-8)と同じで、
 * 同じ予定の実績を合計する。分割した実績の1つを開いたとき、断片だけの大きな不足を出さないため。
 * actuals の中の編集中の実績は、入力中の値(edited)に置き換える。
 * 紐づかない、または編集中の値が不正(終了が開始より前など)なら null。
 */
export function computePlanActualDiff(
  edited: ActualGapInput,
  actuals: ActualGapInput[],
  plan: PlanEventForGap,
): PlanActualDiff | null {
  if (edited.googleEventId !== plan.googleEventId) {
    return null;
  }
  const duration = (entry: { startAt: string; endAt: string }) =>
    differenceInMinutes(parseISO(entry.endAt), parseISO(entry.startAt));
  const editedStartMs = parseISO(edited.startAt).getTime();
  const editedEndMs = parseISO(edited.endAt).getTime();
  // NaN との比較は false になるため、不正な日時もここで除かれる
  if (!(editedEndMs >= editedStartMs)) {
    return null;
  }
  const entries = [
    ...actuals.filter(
      (entry) =>
        entry.googleEventId === plan.googleEventId && entry.id !== edited.id,
    ),
    edited,
  ];
  const earliestStartMs = Math.min(
    ...entries.map((entry) => parseISO(entry.startAt).getTime()),
  );
  return {
    startDiffMinutes: differenceInMinutes(
      new Date(earliestStartMs),
      parseISO(plan.startAt),
    ),
    durationDiffMinutes:
      entries.reduce((sum, entry) => sum + duration(entry), 0) - duration(plan),
    entryCount: entries.length,
  };
}
