import { NextResponse } from "next/server";

import { NOTIFICATION_MESSAGES as M } from "@/lib/notifications/messages";
import {
  deletePushSubscriptionByEndpoint,
  upsertPushSubscription,
} from "@/lib/notifications/store";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/session-user";

// P13-1: Push購読の登録・解除。認証必須。
// push_subscriptions は RLS ポリシーを持たないため、本人確認はこのハンドラの責務。
// 仕様書: docs/specs/P13-1_計測しっぱなしの検知とPush通知.md §4

type SubscribeBody = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
  timezone?: unknown;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

async function requireUserId(): Promise<string | null> {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  return user?.id ?? null;
}

export async function POST(request: Request): Promise<NextResponse> {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: M.enableFailed }, { status: 401 });
  }

  let body: SubscribeBody;
  try {
    body = (await request.json()) as SubscribeBody;
  } catch {
    return NextResponse.json({ error: M.enableFailed }, { status: 400 });
  }

  const endpoint = body.endpoint;
  const p256dhKey = body.keys?.p256dh;
  const authKey = body.keys?.auth;
  const timezone = body.timezone;
  if (
    !isNonEmptyString(endpoint) ||
    !isNonEmptyString(p256dhKey) ||
    !isNonEmptyString(authKey) ||
    !isNonEmptyString(timezone)
  ) {
    return NextResponse.json({ error: M.enableFailed }, { status: 400 });
  }

  const saved = await upsertPushSubscription({
    userId,
    endpoint,
    p256dhKey,
    authKey,
    timezone,
  });
  if (!saved) {
    return NextResponse.json({ error: M.enableFailed }, { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: M.disableFailed }, { status: 401 });
  }

  let endpoint: unknown;
  try {
    const body = (await request.json()) as { endpoint?: unknown };
    endpoint = body.endpoint;
  } catch {
    return NextResponse.json({ error: M.disableFailed }, { status: 400 });
  }
  if (!isNonEmptyString(endpoint)) {
    return NextResponse.json({ error: M.disableFailed }, { status: 400 });
  }

  const deleted = await deletePushSubscriptionByEndpoint(userId, endpoint);
  if (!deleted) {
    return NextResponse.json({ error: M.disableFailed }, { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}
