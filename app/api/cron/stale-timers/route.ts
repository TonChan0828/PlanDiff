import { NextResponse } from "next/server";

import { sendStaleTimerPush } from "@/lib/notifications/push";
import {
  buildStaleTimerPayload,
  staleThresholdAt,
} from "@/lib/notifications/stale-timer";
import {
  deletePushSubscriptionById,
  listPushSubscriptions,
  listStaleEntries,
  markStaleNotified,
  type StaleEntry,
} from "@/lib/notifications/store";

// P13-1: 停止し忘れの計測を日次で検知し、Push通知を送る。
// Vercel Cron が Authorization: Bearer ${CRON_SECRET} を付けて呼ぶ。
// 仕様書: docs/specs/P13-1_計測しっぱなしの検知とPush通知.md §5

/** 送信結果の集計。endpoint や鍵は一切含めない */
type CronSummary = {
  candidates: number;
  notified: number;
  failed: number;
  removed: number;
};

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // 未設定を「検証なし」にフォールバックさせない
  if (!secret) {
    console.error("CRON_SECRETが未設定のため、cronリクエストを拒否しました");
    return false;
  }
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * 1ユーザー分を処理する。1件でも送信に成功したら通知済みにする。
 *
 * one_running_timer_per_user(user_id単位・end_at is null の部分unique index)により、
 * 1ユーザーの実行中タイマーは最大1本。したがって entries は現状 always 1件で、
 * 下のループは実質1周しか回らない。不変条件が変わっても壊れないよう、
 * 失効した購読は以後の周回の対象から外している。
 */
async function notifyUser(
  entries: StaleEntry[],
  now: Date,
  summary: CronSummary,
): Promise<void> {
  const firstEntry = entries[0];
  if (!firstEntry) {
    return;
  }
  const subscriptions = await listPushSubscriptions(firstEntry.userId);
  if (subscriptions.length === 0) {
    // 通知できていないので未通知のまま残す。後日購読すれば翌朝に拾われる
    return;
  }

  // 失効を検知した購読IDはここに集め、以後の周回の送信対象から外す。
  // 除外しないと、次のentryの周回で同じ死んだendpointへ再送し、
  // 既に削除済みの行へ deletePushSubscriptionById を再実行し、
  // summary.removed を多重加算してしまう
  const expiredIds = new Set<string>();

  for (const entry of entries) {
    const activeSubscriptions = subscriptions.filter(
      (subscription) => !expiredIds.has(subscription.id),
    );
    const results = await Promise.allSettled(
      activeSubscriptions.map(async (subscription) => {
        const payload = buildStaleTimerPayload({
          entryTitle: entry.title,
          startAt: entry.startAt,
          now,
          timezone: subscription.timezone,
        });
        const result = await sendStaleTimerPush(subscription, payload);
        if (!result.ok && result.expired) {
          expiredIds.add(subscription.id);
          await deletePushSubscriptionById(subscription.id);
          summary.removed += 1;
        }
        return result;
      }),
    );

    const succeeded = results.some(
      (result) => result.status === "fulfilled" && result.value.ok,
    );
    if (succeeded) {
      await markStaleNotified(entry.id, now);
      summary.notified += 1;
    } else {
      summary.failed += 1;
    }
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const entries = await listStaleEntries(staleThresholdAt(now));
  const summary: CronSummary = {
    candidates: entries.length,
    notified: 0,
    failed: 0,
    removed: 0,
  };

  const byUser = new Map<string, StaleEntry[]>();
  for (const entry of entries) {
    const list = byUser.get(entry.userId);
    if (list) {
      list.push(entry);
    } else {
      byUser.set(entry.userId, [entry]);
    }
  }

  // ユーザー単位で直列。1ユーザーの失敗が他ユーザーを止めないよう例外は個別に握る
  for (const userEntries of byUser.values()) {
    try {
      await notifyUser(userEntries, now, summary);
    } catch (cause) {
      summary.failed += userEntries.length;
      console.error(
        "ユーザー単位の通知処理に失敗しました:",
        cause instanceof Error ? cause.name : "unknown",
      );
    }
  }

  return NextResponse.json(summary, { status: 200 });
}
