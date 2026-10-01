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

type CronSummary = {
  candidates: number;
  notified: number;
  failed: number;
  removed: number;
};

const NO_STORE = { "Cache-Control": "no-store" };

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return (
    Boolean(secret) &&
    request.headers.get("authorization") === `Bearer ${secret}`
  );
}

function safeErrorCode(cause: unknown): string {
  if (
    cause &&
    typeof cause === "object" &&
    "code" in cause &&
    typeof cause.code === "string" &&
    /^[A-Z0-9]{5}$/.test(cause.code)
  ) {
    return cause.code;
  }
  if (cause instanceof Error)
    return cause.name.replace(/[^A-Za-z0-9_]/g, "").slice(0, 40) || "Error";
  return "UNKNOWN";
}

async function notifyUser(
  entries: StaleEntry[],
  now: Date,
  summary: CronSummary,
): Promise<void> {
  const firstEntry = entries[0];
  if (!firstEntry) return;

  const subscriptions = await listPushSubscriptions(firstEntry.userId);
  if (subscriptions.length === 0) return;

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
          await deletePushSubscriptionById(subscription.id);
          expiredIds.add(subscription.id);
          summary.removed += 1;
        }
        return result;
      }),
    );

    const rejected = results.find((result) => result.status === "rejected");
    if (rejected?.status === "rejected") throw rejected.reason;

    const sends = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    const delivered = sends.some((result) => result.ok);
    const hadSendFailure = sends.some((result) => !result.ok);

    if (delivered) {
      // A successful push counts only after the durable marker is saved.
      await markStaleNotified(entry.id, now);
      summary.notified += 1;
    }
    if (!delivered || hadSendFailure) summary.failed += 1;
  }
}

function failureResponse(summary: CronSummary): NextResponse {
  return NextResponse.json(summary, { status: 503, headers: NO_STORE });
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: NO_STORE },
    );
  }

  const now = new Date();
  let entries: StaleEntry[];
  try {
    entries = await listStaleEntries(staleThresholdAt(now));
  } catch (cause) {
    console.error("notifications.cron.list_failed", safeErrorCode(cause));
    return failureResponse({
      candidates: 0,
      notified: 0,
      failed: 1,
      removed: 0,
    });
  }

  const summary: CronSummary = {
    candidates: entries.length,
    notified: 0,
    failed: 0,
    removed: 0,
  };

  const byUser = new Map<string, StaleEntry[]>();
  for (const entry of entries) {
    const list = byUser.get(entry.userId);
    if (list) list.push(entry);
    else byUser.set(entry.userId, [entry]);
  }

  // Continue with independent accounts after one account fails, then surface any
  // partial failure to the scheduler as 503 so it can be retried/alerted.
  for (const userEntries of byUser.values()) {
    try {
      await notifyUser(userEntries, now, summary);
    } catch (cause) {
      summary.failed += userEntries.length;
      console.error("notifications.cron.user_failed", safeErrorCode(cause));
    }
  }

  return NextResponse.json(summary, {
    status: summary.failed > 0 ? 503 : 200,
    headers: NO_STORE,
  });
}
