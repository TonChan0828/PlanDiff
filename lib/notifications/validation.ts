import { ECDH } from "node:crypto";
import { isIP } from "node:net";

const MAX_ENDPOINT_LENGTH = 2048;

const ALLOWED_EXACT_HOSTS = new Set([
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "push.services.mozilla.com",
  "web.push.apple.com",
]);

export function isAllowedPushEndpoint(value: string): boolean {
  if (!value || value.length > MAX_ENDPOINT_LENGTH) return false;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const validHost =
      ALLOWED_EXACT_HOSTS.has(hostname) ||
      (hostname.endsWith(".notify.windows.com") &&
        hostname.length > ".notify.windows.com".length);

    return (
      url.protocol === "https:" &&
      url.port === "" &&
      url.username === "" &&
      url.password === "" &&
      url.hash === "" &&
      isIP(hostname) === 0 &&
      validHost
    );
  } catch {
    return false;
  }
}

function decodeCanonicalBase64Url(value: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const decoded = Buffer.from(value, "base64url");
  return decoded.toString("base64url") === value ? decoded : null;
}

function isValidP256dh(value: string): boolean {
  const publicKey = decodeCanonicalBase64Url(value);
  if (!publicKey || publicKey.length !== 65 || publicKey[0] !== 0x04) {
    return false;
  }
  try {
    ECDH.convertKey(
      publicKey,
      "prime256v1",
      undefined,
      undefined,
      "uncompressed",
    );
    return true;
  } catch {
    return false;
  }
}

function isValidAuth(value: string): boolean {
  return decodeCanonicalBase64Url(value)?.length === 16;
}

function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export type ParsedPushSubscription = {
  endpoint: string;
  p256dhKey: string;
  authKey: string;
  timezone: string;
};

export function parsePushSubscription(
  input: unknown,
): ParsedPushSubscription | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const body = input as Record<string, unknown>;
  const keys = body.keys;
  if (!keys || typeof keys !== "object" || Array.isArray(keys)) return null;
  const keyRecord = keys as Record<string, unknown>;
  const { endpoint, timezone } = body;
  const p256dhKey = keyRecord.p256dh;
  const authKey = keyRecord.auth;

  if (
    typeof endpoint !== "string" ||
    !isAllowedPushEndpoint(endpoint) ||
    typeof p256dhKey !== "string" ||
    !isValidP256dh(p256dhKey) ||
    typeof authKey !== "string" ||
    !isValidAuth(authKey) ||
    typeof timezone !== "string" ||
    !isValidTimezone(timezone)
  ) {
    return null;
  }

  return { endpoint, p256dhKey, authKey, timezone };
}
