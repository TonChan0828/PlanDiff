import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";

export async function readBoundedJson(
  request: Request,
  limit: number,
): Promise<{ ok: true; value: unknown } | { ok: false; status: 400 | 413 }> {
  const length = request.headers.get("content-length");
  if (
    length !== null &&
    (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)))
  )
    return { ok: false, status: 400 };
  if (length !== null && Number(length) > limit)
    return { ok: false, status: 413 };
  const reader = request.body?.getReader();
  if (!reader) return { ok: false, status: 400 };
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return { ok: false, status: 413 };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return {
      ok: true,
      value: JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      ),
    };
  } catch {
    return { ok: false, status: 400 };
  } finally {
    reader.releaseLock();
  }
}

export function allowedRequestOrigin(request: Request): boolean {
  const origins = [process.env.APP_ORIGIN];
  if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL)
    origins.push(`https://${process.env.VERCEL_URL}`);
  if (process.env.NODE_ENV !== "production")
    origins.push("http://localhost:3000", "http://127.0.0.1:3000");
  return origins.some((origin) => {
    try {
      return (
        !!origin && new URL(origin).origin === request.headers.get("origin")
      );
    } catch {
      return false;
    }
  });
}

export function proInterestSourceKey(
  request: Request,
  now = Date.now(),
): string | null {
  const secret = process.env.PRO_INTEREST_HMAC_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) return null;
  // Vercel overwrites this header. Never trust X-Forwarded-For outside Vercel.
  const localDatabase = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let localTest = false;
  try {
    localTest =
      process.env.SECURITY_LOCAL_TESTS === "1" &&
      !!localDatabase &&
      ["localhost", "127.0.0.1"].includes(new URL(localDatabase).hostname);
  } catch {
    /* invalid configuration fails closed below */
  }
  const ip =
    process.env.VERCEL === "1"
      ? request.headers.get("x-vercel-forwarded-for")?.trim()
      : (process.env.NODE_ENV !== "production" || localTest) &&
          ["localhost", "127.0.0.1"].includes(new URL(request.url).hostname)
        ? "127.0.0.1"
        : null;
  if (!ip || !isIP(ip)) return null;
  const canonical = isIP(ip) === 6 ? new URL(`http://[${ip}]/`).hostname : ip;
  return createHmac("sha256", secret)
    .update(`${Math.floor(now / 60_000)}:${canonical}`)
    .digest("hex");
}
