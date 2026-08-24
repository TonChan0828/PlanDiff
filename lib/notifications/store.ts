import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// P13-1: 通知ドメインの service role アクセス。
// push_subscriptions は RLS ポリシーを持たないため、必ずこの経路だけが読み書きする。
// 仕様書: docs/specs/P13-1_計測しっぱなしの検知とPush通知.md

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

/** 購読を登録する。同じ端末(endpoint)からの再登録はupsertで1行に保つ */
export async function upsertPushSubscription(input: {
  userId: string;
  endpoint: string;
  p256dhKey: string;
  authKey: string;
  timezone: string;
}): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("push_subscriptions").upsert(
      {
        user_id: input.userId,
        endpoint: input.endpoint,
        p256dh_key: input.p256dhKey,
        auth_key: input.authKey,
        timezone: input.timezone,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    );
    if (error) {
      console.error("push_subscriptionsの登録に失敗しました:", error.code);
      return false;
    }
    return true;
  } catch (cause) {
    console.error(
      "push_subscriptionsの登録に失敗しました:",
      cause instanceof Error ? cause.name : "unknown",
    );
    return false;
  }
}

/**
 * 購読を解除する。endpoint だけで消せると他人の購読を消せてしまうため、
 * 必ず user_id との両方を条件にする
 */
export async function deletePushSubscriptionByEndpoint(
  userId: string,
  endpoint: string,
): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .eq("endpoint", endpoint);
    if (error) {
      console.error("push_subscriptionsの削除に失敗しました:", error.code);
      return false;
    }
    return true;
  } catch (cause) {
    console.error(
      "push_subscriptionsの削除に失敗しました:",
      cause instanceof Error ? cause.name : "unknown",
    );
    return false;
  }
}

/** 失効した購読を捨てる。放置するとゴミ行が残り毎朝失敗し続ける */
export async function deletePushSubscriptionById(id: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("push_subscriptions")
      .delete()
      .eq("id", id);
    if (error) {
      console.error("失効した購読の削除に失敗しました:", error.code);
    }
  } catch (cause) {
    console.error(
      "失効した購読の削除に失敗しました:",
      cause instanceof Error ? cause.name : "unknown",
    );
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
    if (error) {
      console.error("push_subscriptionsの取得に失敗しました:", error.code);
      return [];
    }
    return (data ?? []).map((row) => ({
      id: row.id,
      endpoint: row.endpoint,
      p256dhKey: row.p256dh_key,
      authKey: row.auth_key,
      timezone: row.timezone,
    }));
  } catch (cause) {
    console.error(
      "push_subscriptionsの取得に失敗しました:",
      cause instanceof Error ? cause.name : "unknown",
    );
    return [];
  }
}

/**
 * 停止し忘れの候補を全ユーザー横断で取得する。
 * 比較は lte(境界を含める)。閾値の算出は staleThresholdAt に任せる
 */
export async function listStaleEntries(threshold: Date): Promise<StaleEntry[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("time_entries")
      .select("id, user_id, title, start_at")
      .is("end_at", null)
      .is("stale_notified_at", null)
      .lte("start_at", threshold.toISOString());
    if (error) {
      console.error("計測しっぱなしの取得に失敗しました:", error.code);
      return [];
    }
    return (data ?? []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      title: row.title,
      startAt: new Date(row.start_at),
    }));
  } catch (cause) {
    console.error(
      "計測しっぱなしの取得に失敗しました:",
      cause instanceof Error ? cause.name : "unknown",
    );
    return [];
  }
}

/** 通知済みマークを立てる。同じ計測に二度と送らないための唯一の記録 */
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
    if (error) {
      console.error("通知済みマークの更新に失敗しました:", error.code);
    }
  } catch (cause) {
    console.error(
      "通知済みマークの更新に失敗しました:",
      cause instanceof Error ? cause.name : "unknown",
    );
  }
}
