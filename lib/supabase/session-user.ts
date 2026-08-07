import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";

// auth.getUser() の重複往復を抑えるヘルパー(P6-1)。
// 仕様書: docs/specs/P6-1_サーバー往復の集約.md
//
// auth.getUser() は毎回 GET /auth/v1/user へのHTTP往復で、ローカルキャッシュを持たない。
// 1リクエスト中に layout / page / lib / Server Action がそれぞれ呼ぶと往復が積み上がるため、
// クライアントインスタンス単位に結果を保持して1回に集約する。
//
// React の cache() を使わないのは、リクエストコンテキスト外(vitest)では素通しになり
// 重複排除を自動テストで固定できないため(React 19.2.4 で実測)。
// WeakMap ならRSC・Server Action・Route Handler・テストのすべてで同じ挙動になる。
//
// このモジュールは next/headers に依存しない。lib/ 配下の純粋なサービス層から
// import できるようにするため、クライアント生成(lib/supabase/server.ts)とは分けている。

// キーはリクエストごとに生成されるクライアントインスタンスなので、
// ユーザーをまたいで共有されることはなく、リクエスト終了後はGC対象になる。
const userByClient = new WeakMap<SupabaseClient, Promise<User | null>>();

/** 本人のユーザー情報を返す。未ログイン・検証失敗はいずれも null(例外にしない) */
export function getSessionUser(client: SupabaseClient): Promise<User | null> {
  const cached = userByClient.get(client);
  if (cached) {
    return cached;
  }
  // 解決値ではなくPromiseを保持することで、並行呼び出しでも往復を1回に抑える
  const pending = client.auth
    .getUser()
    .then(({ data }) => data.user ?? null)
    .catch(() => null);
  userByClient.set(client, pending);
  return pending;
}
