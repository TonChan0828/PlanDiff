import { NextResponse } from "next/server";

import { NOTIFICATION_MESSAGES as M } from "@/lib/notifications/messages";
import {
  deletePushSubscriptionByEndpoint,
  findPushSubscriptionId,
  SubscriptionEndpointConflictError,
  SubscriptionLimitError,
  upsertPushSubscription,
} from "@/lib/notifications/store";
import { DEVICE_SUBSCRIPTION_COOKIE } from "@/lib/notifications/device-cookie";
import {
  isAllowedPushEndpoint,
  parsePushSubscription,
} from "@/lib/notifications/validation";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/session-user";

const MAX_BODY_BYTES = 8 * 1024;
const NO_STORE = { "Cache-Control": "no-store" };
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

type BodyReadResult = { ok: true; value: unknown } | { ok: false };

async function readJsonBody(request: Request): Promise<BodyReadResult> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return { ok: false };
  }
  if (!request.body) return { ok: false };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        return { ok: false };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false };
  }

  try {
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: false };
  }
}

function noStoreJson(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function noStoreEmpty(status: number): NextResponse {
  return new NextResponse(null, { status, headers: NO_STORE });
}

function setDeviceCookie(response: NextResponse, request: Request, id: string) {
  response.cookies.set(DEVICE_SUBSCRIPTION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(request.url).protocol === "https:",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

function clearDeviceCookie(response: NextResponse, request: Request) {
  response.cookies.set(DEVICE_SUBSCRIPTION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(request.url).protocol === "https:",
    path: "/",
    maxAge: 0,
  });
}

async function requireUserId(): Promise<string | null> {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  return user?.id ?? null;
}

export async function POST(request: Request): Promise<NextResponse> {
  const userId = await requireUserId();
  if (!userId) return noStoreJson({ error: M.enableFailed }, 401);

  const bodyResult = await readJsonBody(request);
  if (
    !bodyResult.ok ||
    !bodyResult.value ||
    typeof bodyResult.value !== "object" ||
    Array.isArray(bodyResult.value)
  ) {
    return noStoreJson({ error: M.enableFailed }, 400);
  }
  const body = bodyResult.value as Record<string, unknown>;

  if (body.mode === "check") {
    const endpoint = body.endpoint;
    if (typeof endpoint !== "string" || !isAllowedPushEndpoint(endpoint)) {
      return noStoreJson({ error: M.enableFailed }, 400);
    }
    try {
      const id = await findPushSubscriptionId(userId, endpoint);
      const response = noStoreJson({ enabled: id !== null }, 200);
      if (id) setDeviceCookie(response, request, id);
      else clearDeviceCookie(response, request);
      return response;
    } catch {
      return noStoreJson({ error: M.checkFailed }, 500);
    }
  }

  const subscription = parsePushSubscription(body);
  if (!subscription) return noStoreJson({ error: M.enableFailed }, 400);

  try {
    const id = await upsertPushSubscription({ userId, ...subscription });
    const response = noStoreEmpty(204);
    setDeviceCookie(response, request, id);
    return response;
  } catch (cause) {
    if (cause instanceof SubscriptionLimitError) {
      return noStoreJson({ error: M.subscriptionLimit }, 429);
    }
    if (cause instanceof SubscriptionEndpointConflictError) {
      return noStoreJson({ error: M.enableFailed }, 409);
    }
    return noStoreJson({ error: M.enableFailed }, 500);
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const userId = await requireUserId();
  if (!userId) return noStoreJson({ error: M.disableFailed }, 401);

  const bodyResult = await readJsonBody(request);
  const body = bodyResult.ok ? bodyResult.value : null;
  const endpoint =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>).endpoint
      : null;
  if (typeof endpoint !== "string" || !isAllowedPushEndpoint(endpoint)) {
    return noStoreJson({ error: M.disableFailed }, 400);
  }

  try {
    const id = await findPushSubscriptionId(userId, endpoint);
    await deletePushSubscriptionByEndpoint(userId, endpoint);
    const response = noStoreEmpty(204);
    if (id) {
      // Preserve another device's logout marker if a caller supplied a different endpoint.
      const cookieId = request.headers
        .get("cookie")
        ?.split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${DEVICE_SUBSCRIPTION_COOKIE}=`))
        ?.slice(DEVICE_SUBSCRIPTION_COOKIE.length + 1);
      if (cookieId === id) clearDeviceCookie(response, request);
    }
    return response;
  } catch {
    return noStoreJson({ error: M.disableFailed }, 500);
  }
}
