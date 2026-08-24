import "server-only";

import webpush, { WebPushError } from "web-push";

import type { StaleTimerPayload } from "@/lib/notifications/stale-timer";
import type { PushSubscriptionRecord } from "@/lib/notifications/store";

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
    );
    return { ok: true };
  } catch (cause) {
    if (cause instanceof WebPushError) {
      const expired = EXPIRED_STATUS_CODES.has(cause.statusCode);
      // endpoint は出さない。購読IDとステータスだけで追跡できる
      console.error(
        `Push送信に失敗しました(subscription=${subscription.id}, status=${cause.statusCode})`,
      );
      return { ok: false, expired };
    }
    console.error(
      `Push送信に失敗しました(subscription=${subscription.id}):`,
      cause instanceof Error ? cause.name : "unknown",
    );
    return { ok: false, expired: false };
  }
}
