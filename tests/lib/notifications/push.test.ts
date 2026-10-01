import { createECDH } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendNotification = vi.hoisted(() => vi.fn());
const setVapidDetails = vi.hoisted(() => vi.fn());

const FakeWebPushError = vi.hoisted(() => {
  return class FakeWebPushError extends Error {
    statusCode: number;
    constructor(statusCode: number) {
      super(`push failed: ${statusCode}`);
      this.name = "WebPushError";
      this.statusCode = statusCode;
    }
  };
});

vi.mock("web-push", () => ({
  default: { sendNotification, setVapidDetails },
  WebPushError: FakeWebPushError,
}));

import {
  resetVapidForTest,
  sendStaleTimerPush,
} from "@/lib/notifications/push";

// 仕様書: docs/specs/P13-1_計測しっぱなしの検知とPush通知.md §5(失効した購読の削除)

const ecdh = createECDH("prime256v1");
ecdh.generateKeys();
const subscription = {
  id: "sub-1",
  endpoint: "https://fcm.googleapis.com/fcm/send/abc",
  p256dhKey: ecdh.getPublicKey().toString("base64url"),
  authKey: Buffer.alloc(16, 1).toString("base64url"),
  timezone: "Asia/Tokyo",
};

const payload = {
  title: "計測しっぱなしかもしれません",
  body: "「設計レビュー」を 8月24日 21:30 から 13時間20分 計測中です",
  tag: "stale-timer",
  url: "/track",
};

beforeEach(() => {
  vi.clearAllMocks();
  // モジュールスコープの vapidConfigured がテスト間で残ると
  // 「鍵が未設定なら送らない」のテストが順序に依存して落ちる
  resetVapidForTest();
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "public-key";
  process.env.VAPID_PRIVATE_KEY = "private-key";
});

describe("sendStaleTimerPush", () => {
  it("成功したら ok: true を返し、endpoint と鍵を web-push に渡す", async () => {
    sendNotification.mockResolvedValue({ statusCode: 201 });

    const result = await sendStaleTimerPush(subscription, payload);

    expect(result).toEqual({ ok: true });
    expect(sendNotification).toHaveBeenCalledWith(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dhKey, auth: subscription.authKey },
      },
      JSON.stringify(payload),
      { timeout: 5000 },
    );
  });

  it("410 は失効として expired: true を返す", async () => {
    sendNotification.mockRejectedValue(new FakeWebPushError(410));

    const result = await sendStaleTimerPush(subscription, payload);

    expect(result).toEqual({ ok: false, expired: true });
  });

  it("404 も失効として expired: true を返す", async () => {
    sendNotification.mockRejectedValue(new FakeWebPushError(404));

    const result = await sendStaleTimerPush(subscription, payload);

    expect(result).toEqual({ ok: false, expired: true });
  });

  it("500 は一時的な失敗として expired: false を返す", async () => {
    sendNotification.mockRejectedValue(new FakeWebPushError(500));

    const result = await sendStaleTimerPush(subscription, payload);

    expect(result).toEqual({ ok: false, expired: false });
  });

  it("VAPID鍵が未設定なら送信せず expired: false を返す", async () => {
    delete process.env.VAPID_PRIVATE_KEY;

    const result = await sendStaleTimerPush(subscription, payload);

    expect(result).toEqual({ ok: false, expired: false });
    expect(sendNotification).not.toHaveBeenCalled();
  });
});

describe("N12: 送信の制限", () => {
  it("保存済みの不正なendpointには送信しない", async () => {
    const result = await sendStaleTimerPush(
      { ...subscription, endpoint: "https://127.0.0.1/internal" },
      payload,
    );
    expect(result).toEqual({ ok: false, expired: true });
    expect(sendNotification).not.toHaveBeenCalled();
  });
  it("socket timeoutは送信失敗として返す", async () => {
    sendNotification.mockRejectedValue(new Error("Socket timeout"));
    expect(await sendStaleTimerPush(subscription, payload)).toEqual({
      ok: false,
      expired: false,
    });
  });
});
