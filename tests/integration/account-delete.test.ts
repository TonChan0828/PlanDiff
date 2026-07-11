import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteUserAccount } from "@/lib/supabase/admin";
import {
  createAdminClient,
  createDbSql,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "./helpers";

// 仕様書: docs/specs/P4-2_設定画面.md S4・S5・S11(データ全削除のcascade検証)

const TABLES = [
  "profiles",
  "google_tokens",
  "synced_events",
  "time_entries",
] as const;

describe("アカウント削除(結合)", () => {
  let admin: SupabaseClient;
  let sql: ReturnType<typeof createDbSql>;
  let userA: TestUser;
  let userB: TestUser;

  async function seedUserData(admin: SupabaseClient, userId: string) {
    const { error: eventError } = await admin.from("synced_events").insert({
      user_id: userId,
      google_event_id: `app:${crypto.randomUUID()}`,
      title: "アプリ内予定",
      start_at: "2026-07-11T01:00:00Z",
      end_at: "2026-07-11T02:00:00Z",
      source: "app",
    });
    if (eventError) throw new Error(`予定の投入に失敗: ${eventError.message}`);

    const { error: entryError } = await admin.from("time_entries").insert([
      {
        user_id: userId,
        title: "完了済み実績",
        start_at: "2026-07-11T01:00:00Z",
        end_at: "2026-07-11T01:30:00Z",
      },
      {
        // 実行中タイマー(end_at IS NULL)
        user_id: userId,
        title: "実行中タイマー",
        start_at: "2026-07-11T02:00:00Z",
        end_at: null,
      },
    ]);
    if (entryError) throw new Error(`実績の投入に失敗: ${entryError.message}`);

    const { error: tokenError } = await admin.from("google_tokens").insert({
      user_id: userId,
      refresh_token: "it-refresh-token",
    });
    if (tokenError)
      throw new Error(`トークンの投入に失敗: ${tokenError.message}`);
  }

  async function countRows(userId: string): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const table of TABLES) {
      const column = table === "profiles" ? "id" : "user_id";
      const [row] = await sql`
        select count(*)::int as count from ${sql(table)}
        where ${sql(column)} = ${userId}
      `;
      if (!row) throw new Error(`${table} の件数取得に失敗しました`);
      counts[table] = row.count;
    }
    const [authRow] = await sql`
      select count(*)::int as count from auth.users where id = ${userId}
    `;
    if (!authRow) throw new Error("auth.users の件数取得に失敗しました");
    counts["auth.users"] = authRow.count;
    return counts;
  }

  beforeAll(async () => {
    admin = createAdminClient();
    sql = createDbSql();
    userA = await createTestUser(admin, "削除対象ユーザー");
    userB = await createTestUser(admin, "無関係ユーザー");
    await seedUserData(admin, userA.id);
    await seedUserData(admin, userB.id);
  });

  afterAll(async () => {
    // userAはテスト内で削除済みの想定。残っていた場合のみ後始末する
    for (const user of [userA, userB]) {
      if (!user) continue;
      const { data } = await admin.auth.admin.getUserById(user.id);
      if (data.user) await deleteTestUser(admin, user.id);
    }
    await sql.end();
  });

  it("S4/S11: 実行中タイマー・アプリ予定・トークンを含む全データがcascadeで削除される", async () => {
    // 前提: 各テーブルに行があること(profilesはトリガーで自動作成)
    const before = await countRows(userA.id);
    expect(before["auth.users"]).toBe(1);
    expect(before.profiles).toBe(1);
    expect(before.synced_events).toBe(1);
    expect(before.time_entries).toBe(2); // 完了済み+実行中(S11)
    expect(before.google_tokens).toBe(1);

    const ok = await deleteUserAccount(userA.id);
    expect(ok).toBe(true);

    const after = await countRows(userA.id);
    expect(after).toEqual({
      "auth.users": 0,
      profiles: 0,
      google_tokens: 0,
      synced_events: 0,
      time_entries: 0,
    });
  });

  it("S5: 他ユーザーのデータは影響を受けない", async () => {
    const counts = await countRows(userB.id);
    expect(counts["auth.users"]).toBe(1);
    expect(counts.profiles).toBe(1);
    expect(counts.synced_events).toBe(1);
    expect(counts.time_entries).toBe(2);
    expect(counts.google_tokens).toBe(1);
  });
});
