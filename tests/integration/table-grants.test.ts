import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createAdminClient,
  createAnonClient,
  createDbSql,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "./helpers";

// 仕様書: docs/specs/P6-5_anon権限の剥奪.md S1〜S8

const admin = createAdminClient();
let userA: TestUser;
let userB: TestUser;

/** アプリが authenticated に許すテーブル権限(これ以外は付けない) */
const EXPECTED_AUTHENTICATED: Record<string, string[]> = {
  profiles: ["SELECT", "UPDATE"],
  synced_events: ["DELETE", "INSERT", "SELECT", "UPDATE"],
  time_entries: ["DELETE", "INSERT", "SELECT", "UPDATE"],
  recurring_rules: ["DELETE", "INSERT", "SELECT", "UPDATE"],
  recurring_exceptions: ["DELETE", "INSERT", "SELECT", "UPDATE"],
  // google_tokens / pro_interest_events / push_subscriptions は
  // service role 専用のため一切付けない
};

beforeAll(async () => {
  userA = await createTestUser(admin, "権限A");
  userB = await createTestUser(admin, "権限B");
});

afterAll(async () => {
  await deleteTestUser(admin, userA.id);
  await deleteTestUser(admin, userB.id);
});

describe("テーブル権限の最小化(S1〜S4)", () => {
  it("S1: anon は public のどのテーブルにも権限を持たない", async () => {
    const sql = createDbSql();
    try {
      const rows = await sql`
        select table_name, privilege_type
        from information_schema.role_table_grants
        where table_schema = 'public' and grantee = 'anon'
      `;
      expect(rows).toEqual([]);
    } finally {
      await sql.end();
    }
  });

  it("S2: authenticated の権限がテーブルごとに期待どおり", async () => {
    const sql = createDbSql();
    try {
      const rows = await sql`
        select table_name, privilege_type
        from information_schema.role_table_grants
        where table_schema = 'public' and grantee = 'authenticated'
      `;
      const actual: Record<string, string[]> = {};
      for (const row of rows) {
        const table = row.table_name as string;
        (actual[table] ??= []).push(row.privilege_type as string);
      }
      for (const table of Object.keys(actual)) {
        actual[table]!.sort();
      }

      expect(actual).toEqual(EXPECTED_AUTHENTICATED);
      // service role 専用テーブルに権限が付いていないこと
      expect(actual.google_tokens).toBeUndefined();
      expect(actual.pro_interest_events).toBeUndefined();
    } finally {
      await sql.end();
    }
  });

  it("S3: authenticated は TRUNCATE / REFERENCES / TRIGGER を持たない", async () => {
    const sql = createDbSql();
    try {
      const rows = await sql`
        select table_name, privilege_type
        from information_schema.role_table_grants
        where table_schema = 'public'
          and grantee in ('anon', 'authenticated')
          and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')
      `;
      expect(rows).toEqual([]);
    } finally {
      await sql.end();
    }
  });

  it("S4: postgres 所有の既定権限に anon / authenticated が含まれない", async () => {
    const sql = createDbSql();
    try {
      const rows = await sql`
        select d.defaclacl::text as acl
        from pg_default_acl d
        join pg_namespace n on n.oid = d.defaclnamespace
        where n.nspname = 'public'
          and d.defaclobjtype = 'r'
          and pg_get_userbyid(d.defaclrole) = 'postgres'
      `;
      expect(rows).toHaveLength(1);
      const acl = rows[0]!.acl as string;
      // マイグレーションは postgres として実行されるため、この既定が新規テーブルに適用される
      expect(acl).not.toContain("anon=");
      expect(acl).not.toContain("authenticated=");
      // service_role の既定は変更しない
      expect(acl).toContain("service_role=");
    } finally {
      await sql.end();
    }
  });

  it("S9: postgres 所有の既定権限は関数(ROUTINES)にも anon / authenticated を含まない", async () => {
    // P6-5 本体は TABLES/SEQUENCES のみを止めていた。本番検証で ROUTINES の
    // 既定権限が残っていることが分かったため追補で塞いだ(5-D)
    const sql = createDbSql();
    try {
      const rows = await sql`
        select d.defaclobjtype::text as objtype, d.defaclacl::text as acl
        from pg_default_acl d
        join pg_namespace n on n.oid = d.defaclnamespace
        where n.nspname = 'public'
          and pg_get_userbyid(d.defaclrole) = 'postgres'
      `;
      // r=テーブル / S=シーケンス / f=関数 のいずれにも anon / authenticated を含まない
      for (const row of rows) {
        expect(row.acl as string).not.toContain("anon=");
        expect(row.acl as string).not.toContain("authenticated=");
      }
      expect(rows.map((r) => r.objtype).sort()).toContain("f");
    } finally {
      await sql.end();
    }
  });
});

describe("権限の付け直しで既存機能が壊れていないこと(S5〜S8)", () => {
  it("S5: 認証済みユーザーは自分の予定を作成・取得・更新・削除できる", async () => {
    const insert = await userA.client
      .from("synced_events")
      .insert({
        user_id: userA.id,
        google_event_id: "app:grant-check",
        source: "app",
        title: "権限確認",
        start_at: new Date().toISOString(),
        end_at: new Date(Date.now() + 3_600_000).toISOString(),
      })
      .select("id")
      .single();
    expect(insert.error).toBeNull();
    const id = insert.data!.id as string;

    const read = await userA.client
      .from("synced_events")
      .select("title")
      .eq("id", id)
      .single();
    expect(read.error).toBeNull();
    expect(read.data!.title).toBe("権限確認");

    const update = await userA.client
      .from("synced_events")
      .update({ title: "更新後" })
      .eq("id", id);
    expect(update.error).toBeNull();

    const remove = await userA.client
      .from("synced_events")
      .delete()
      .eq("id", id);
    expect(remove.error).toBeNull();
  });

  it("S6: 他人の行は読めない(RLSは従来どおり)", async () => {
    const { error } = await admin.from("synced_events").insert({
      user_id: userA.id,
      google_event_id: "app:rls-check",
      source: "app",
      title: "Aの予定",
      start_at: new Date().toISOString(),
      end_at: new Date(Date.now() + 3_600_000).toISOString(),
    });
    expect(error).toBeNull();

    const asB = await userB.client
      .from("synced_events")
      .select("id")
      .eq("google_event_id", "app:rls-check");
    expect(asB.data ?? []).toEqual([]);

    await admin.from("synced_events").delete().eq("user_id", userA.id);
  });

  it("S7: 未認証(anonキー)では他人のデータが返らない", async () => {
    const anon = createAnonClient();

    const { data, error } = await anon.from("synced_events").select("id");

    // 権限剥奪により権限エラーになる。仮にエラーでなくても行は返らない
    if (!error) {
      expect(data ?? []).toEqual([]);
    } else {
      expect(error.message).toBeTruthy();
    }
  });

  it("S8: service role は google_tokens を従来どおり読み書きできる", async () => {
    const upsert = await admin
      .from("google_tokens")
      .upsert({ user_id: userA.id, refresh_token: "dummy-token" });
    expect(upsert.error).toBeNull();

    const read = await admin
      .from("google_tokens")
      .select("refresh_token")
      .eq("user_id", userA.id)
      .maybeSingle();
    expect(read.error).toBeNull();
    expect(read.data?.refresh_token).toBe("dummy-token");

    const remove = await admin
      .from("google_tokens")
      .delete()
      .eq("user_id", userA.id);
    expect(remove.error).toBeNull();
  });
});

// 仕様書: docs/specs/P13-1_計測しっぱなしの検知とPush通知.md S32 / S33
describe("push_subscriptions の権限(P13-1 S32〜S33)", () => {
  it("S32: authenticated は push_subscriptions を SELECT できない", async () => {
    // createTestUser が返す client は既にサインイン済みの authenticated 文脈。
    // TestUser は password を持たないため、この client をそのまま使う
    const { data, error } = await userA.client
      .from("push_subscriptions")
      .select("id");

    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it("S33: anon は push_subscriptions を SELECT できない", async () => {
    const anon = createAnonClient();

    const { data, error } = await anon.from("push_subscriptions").select("id");

    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });
});
