import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// push_subscriptions has RLS enabled without client policies. All access stays in
// this server-only module and uses the service-role client.

const PAGE_SIZE = 1000;

export type PushSubscriptionRecord = {
  id: string;
  endpoint: string;
  p256dhKey: string;
  authKey: string;
  timezone: string;
};

export type StaleEntry = {
  id: string;
  userId: string;
  title: string;
  startAt: Date;
};

export class NotificationStoreError extends Error {
  constructor(readonly code: string) {
    super("Notification store operation failed");
    this.name = "NotificationStoreError";
  }
}

export class SubscriptionLimitError extends Error {
  constructor() {
    super("Push subscription limit reached");
    this.name = "SubscriptionLimitError";
  }
}

export class SubscriptionEndpointConflictError extends Error {
  constructor() {
    super("Push endpoint is already registered");
    this.name = "SubscriptionEndpointConflictError";
  }
}

function errorCode(cause: unknown): string {
  if (
    cause &&
    typeof cause === "object" &&
    "code" in cause &&
    typeof cause.code === "string" &&
    /^[A-Z0-9]{5}$/.test(cause.code)
  ) {
    return cause.code;
  }
  return "UNKNOWN";
}

function isDomainConflict(cause: unknown, message: string): boolean {
  return (
    cause !== null &&
    typeof cause === "object" &&
    "code" in cause &&
    cause.code === "23514" &&
    "message" in cause &&
    cause.message === message
  );
}

function fail(event: string, cause: unknown): NotificationStoreError {
  const code = errorCode(cause);
  console.error(event, code);
  return new NotificationStoreError(code);
}

/** Save a subscription and return its opaque server-owned row ID. */
export async function upsertPushSubscription(input: {
  userId: string;
  endpoint: string;
  p256dhKey: string;
  authKey: string;
  timezone: string;
}): Promise<string> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("push_subscriptions")
      .upsert(
        {
          user_id: input.userId,
          endpoint: input.endpoint,
          p256dh_key: input.p256dhKey,
          auth_key: input.authKey,
          timezone: input.timezone,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "endpoint" },
      )
      .select("id")
      .single();
    if (error) {
      if (isDomainConflict(error, "push_subscription_limit_exceeded")) {
        throw new SubscriptionLimitError();
      }
      if (isDomainConflict(error, "push_endpoint_owned_by_another_user")) {
        throw new SubscriptionEndpointConflictError();
      }
      throw fail("notifications.store.upsert_failed", error);
    }
    if (!data?.id) {
      throw fail("notifications.store.upsert_missing_id", null);
    }
    return data.id;
  } catch (cause) {
    if (
      cause instanceof SubscriptionLimitError ||
      cause instanceof SubscriptionEndpointConflictError ||
      cause instanceof NotificationStoreError
    ) {
      throw cause;
    }
    throw fail("notifications.store.upsert_failed", cause);
  }
}

/** Look up the current user's row without returning endpoint or keys to callers. */
export async function findPushSubscriptionId(
  userId: string,
  endpoint: string,
): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("push_subscriptions")
      .select("id")
      .eq("user_id", userId)
      .eq("endpoint", endpoint)
      .maybeSingle();
    if (error) throw fail("notifications.store.lookup_failed", error);
    return data?.id ?? null;
  } catch (cause) {
    if (cause instanceof NotificationStoreError) throw cause;
    throw fail("notifications.store.lookup_failed", cause);
  }
}

export async function deletePushSubscriptionByEndpoint(
  userId: string,
  endpoint: string,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .eq("endpoint", endpoint);
    if (error) throw fail("notifications.store.delete_endpoint_failed", error);
  } catch (cause) {
    if (cause instanceof NotificationStoreError) throw cause;
    throw fail("notifications.store.delete_endpoint_failed", cause);
  }
}

/** Delete only the row named by the HttpOnly per-device cookie and current user. */
export async function deletePushSubscriptionForUser(
  id: string,
  userId: string,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("push_subscriptions")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw fail("notifications.store.logout_delete_failed", error);
  } catch (cause) {
    if (cause instanceof NotificationStoreError) throw cause;
    throw fail("notifications.store.logout_delete_failed", cause);
  }
}

/** Delete an expired subscription after the push service returned 404/410. */
export async function deletePushSubscriptionById(id: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("push_subscriptions")
      .delete()
      .eq("id", id);
    if (error) throw fail("notifications.store.delete_expired_failed", error);
  } catch (cause) {
    if (cause instanceof NotificationStoreError) throw cause;
    throw fail("notifications.store.delete_expired_failed", cause);
  }
}

export async function listPushSubscriptions(
  userId: string,
): Promise<PushSubscriptionRecord[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh_key, auth_key, timezone")
      .eq("user_id", userId);
    if (error)
      throw fail("notifications.store.list_subscriptions_failed", error);
    return (data ?? []).map((row) => ({
      id: row.id,
      endpoint: row.endpoint,
      p256dhKey: row.p256dh_key,
      authKey: row.auth_key,
      timezone: row.timezone,
    }));
  } catch (cause) {
    if (cause instanceof NotificationStoreError) throw cause;
    throw fail("notifications.store.list_subscriptions_failed", cause);
  }
}

/** Read every stale entry using stable keyset pages, without PostgREST's 1,000-row cap. */
export async function listStaleEntries(threshold: Date): Promise<StaleEntry[]> {
  const entries: StaleEntry[] = [];
  let afterId: string | null = null;

  try {
    while (true) {
      const admin = createAdminClient();
      let query = admin
        .from("time_entries")
        .select("id, user_id, title, start_at")
        .is("end_at", null)
        .is("stale_notified_at", null)
        .lte("start_at", threshold.toISOString());
      if (afterId) query = query.gt("id", afterId);
      const { data, error } = await query
        .order("id", { ascending: true })
        .limit(PAGE_SIZE);
      if (error) throw fail("notifications.store.list_stale_failed", error);
      const page = data ?? [];
      for (const row of page) {
        entries.push({
          id: row.id,
          userId: row.user_id,
          title: row.title,
          startAt: new Date(row.start_at),
        });
      }
      if (page.length < PAGE_SIZE) return entries;
      afterId = page[page.length - 1]!.id;
    }
  } catch (cause) {
    if (cause instanceof NotificationStoreError) throw cause;
    throw fail("notifications.store.list_stale_failed", cause);
  }
}

export async function markStaleNotified(
  entryId: string,
  at: Date,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("time_entries")
      .update({ stale_notified_at: at.toISOString() })
      .eq("id", entryId);
    if (error) throw fail("notifications.store.mark_notified_failed", error);
  } catch (cause) {
    if (cause instanceof NotificationStoreError) throw cause;
    throw fail("notifications.store.mark_notified_failed", cause);
  }
}
