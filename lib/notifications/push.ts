import "server-only";

import webpush, { WebPushError } from "web-push";

import type { StaleTimerPayload } from "@/lib/notifications/stale-timer";
import type { PushSubscriptionRecord } from "@/lib/notifications/store";
import { parsePushSubscription } from "@/lib/notifications/validation";

// P13-1: web-push の薄いラッパ。呼び出し側が web-push の型と例外を知らずに済むようにする。
// 秘匿値(VAPID秘密鍵・endpoint・鍵)はログにも戻り値にも含めない

export type PushSendResult = { ok: true } | { ok: false; expired: boolean };

/** 送信先が消えた(購読が無効になった)ことを表すHTTPステータス */
const EXPIRED_STATUS_CODES = new Set([404, 410]);

const VAPID_SUBJECT = "mailto:support@plandiff.app";

let vapidConfigured = false;

/** VAPIDを一度だけ設定する。未設定なら false(呼び出し側は送信を諦める) */
function ensureVapid(): boolean {
  if (vapidConfigured) {
    return true;
  }
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    // 鍵の値そのものは絶対に出さない
    console.error("VAPID鍵が設定されていないため、Push通知を送信できません");
    return false;
  }
  webpush.setVapidDetails(VAPID_SUBJECT, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

/** テスト用に設定状態を戻す(本番コードからは呼ばない) */
export function resetVapidForTest(): void {
  vapidConfigured = false;
}

export async function sendStaleTimerPush(
  subscription: PushSubscriptionRecord,
  payload: StaleTimerPayload,
): Promise<PushSendResult> {
  const validated = parsePushSubscription({
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.p256dhKey, auth: subscription.authKey },
    timezone: subscription.timezone,
  });
  if (!validated) {
    console.error("notifications.push.invalid_subscription");
    return { ok: false, expired: true };
  }
  if (!ensureVapid()) {
    return { ok: false, expired: false };
  }
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dhKey, auth: subscription.authKey },
      },
      JSON.stringify(payload),
      { timeout: 5000 },
    );
    return { ok: true };
  } catch (cause) {
    if (cause instanceof WebPushError) {
      const expired = EXPIRED_STATUS_CODES.has(cause.statusCode);
      console.error("notifications.push.send_failed", String(cause.statusCode));
      return { ok: false, expired };
    }
    console.error(
      "notifications.push.send_failed",
      cause instanceof Error
        ? cause.name.replace(/[^A-Za-z0-9_]/g, "").slice(0, 40)
        : "UNKNOWN",
    );
    return { ok: false, expired: false };
  }
}
