import { createECDH } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  isAllowedPushEndpoint,
  parsePushSubscription,
} from "@/lib/notifications/validation";

const ecdh = createECDH("prime256v1");
ecdh.generateKeys();
const valid = {
  endpoint: "https://fcm.googleapis.com/fcm/send/test",
  keys: {
    p256dh: ecdh.getPublicKey().toString("base64url"),
    auth: Buffer.alloc(16, 1).toString("base64url"),
  },
  timezone: "Asia/Tokyo",
};

describe("N1: Push購読の入力境界", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/test",
    "https://updates.push.services.mozilla.com/wpush/v2/test",
    "https://web.push.apple.com/Qabc",
    "https://wns2-bl2p.notify.windows.com/w/?token=x",
  ])("正規のPushサービス: %s", (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(true);
    expect(parsePushSubscription({ ...valid, endpoint })).not.toBeNull();
  });
  it.each([
    "https://127.0.0.1/push",
    "https://[::1]/push",
    "http://fcm.googleapis.com/fcm/send/test",
    "https://fcm.googleapis.com.evil.test/test",
    "https://evil.test/?host=fcm.googleapis.com",
    "https://user:password@fcm.googleapis.com/test",
    "https://fcm.googleapis.com:8443/test",
    "https://fcm.googleapis.com/test#fragment",
    "https://evil.notify.windows.com.evil.test/test",
    "https://fcm.googleapis.com/" + "x".repeat(2048),
    "invalid",
  ])("危険/無効なURL: %s", (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(false);
    expect(parsePushSubscription({ ...valid, endpoint })).toBeNull();
  });
  it("鍵・timezone・JSONの型を厳密に検証する", () => {
    for (const body of [
      null,
      [],
      {},
      { ...valid, timezone: "invalid-zone" },
      { ...valid, keys: { ...valid.keys, auth: "x" } },
      {
        ...valid,
        keys: { ...valid.keys, p256dh: Buffer.alloc(65).toString("base64url") },
      },
      { ...valid, keys: { ...valid.keys, p256dh: valid.keys.p256dh + "!" } },
    ]) {
      expect(parsePushSubscription(body)).toBeNull();
    }
  });
});
