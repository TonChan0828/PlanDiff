import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createAdminClient,
  createDbSql,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "./helpers";

// 仕様書: docs/specs/P0-6_DBスキーマとRLS.md の テストシナリオ S1〜S10
// 前提: ローカルSupabaseが起動済みで、マイグレーション適用済み(npx supabase db reset)

const admin = createAdminClient();
const sql = createDbSql();

const START = "2026-07-05T09:00:00.000Z";
const END = "2026-07-05T10:00:00.000Z";

let userA: TestUser;
let userB: TestUser;

beforeAll(async () => {
  userA = await createTestUser(admin, "テスト太郎");
  userB = await createTestUser(admin, "テスト次郎");
});

afterAll(async () => {
  if (userA) await deleteTestUser(admin, userA.id);
  if (userB) await deleteTestUser(admin, userB.id);
  await sql.end();
});

describe("P0-6 コアスキーマ+RLS", () => {
  it("S1: マイグレーション適用後、4テーブルが存在しすべてRLSが有効である", async () => {
    const rows = await sql`
      select relname, relrowsecurity
      from pg_class
      where relnamespace = 'public'::regnamespace
        and relname in ('profiles', 'google_tokens', 'synced_events', 'time_entries')
    `;
    const names = rows.map((r) => r.relname as string).sort();
    expect(names).toEqual([
      "google_tokens",
      "profiles",
      "synced_events",
      "time_entries",
    ]);
    for (const row of rows) {
      expect(row.relrowsecurity, `${row.relname} のRLSが無効`).toBe(true);
    }
  });

  it("S2: ユーザー作成トリガーで profiles が自動作成され display_name が反映される", async () => {
    const { data, error } = await userA.client
      .from("profiles")
      .select("id, display_name");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]).toMatchObject({
      id: userA.id,
      display_name: "テスト太郎",
    });
  });

  it("S3: 本人の time_entries は insert / select / update / delete すべて成功する", async () => {
    const { data: inserted, error: insertError } = await userA.client
      .from("time_entries")
      .insert({
        user_id: userA.id,
        title: "実装作業",
        start_at: START,
        end_at: END,
      })
      .select()
      .single();
    expect(insertError).toBeNull();
    expect(inserted).not.toBeNull();

    const { data: selected, error: selectError } = await userA.client
      .from("time_entries")
      .select()
      .eq("id", inserted.id);
    expect(selectError).toBeNull();
    expect(selected).toHaveLength(1);

    const { data: updated, error: updateError } = await userA.client
      .from("time_entries")
      .update({ title: "実装作業(修正)" })
      .eq("id", inserted.id)
      .select()
      .single();
    expect(updateError).toBeNull();
    expect(updated?.title).toBe("実装作業(修正)");

    const { error: deleteError } = await userA.client
      .from("time_entries")
      .delete()
      .eq("id", inserted.id);
    expect(deleteError).toBeNull();

    const { data: afterDelete } = await userA.client
      .from("time_entries")
      .select()
      .eq("id", inserted.id);
    expect(afterDelete).toHaveLength(0);
  });

  it("S4: 他人の行は select で0行、他人の user_id での insert はRLS違反で失敗する", async () => {
    const { error: seedTimeEntryError } = await userB.client
      .from("time_entries")
      .insert({
        user_id: userB.id,
        title: "Bの実績",
        start_at: START,
        end_at: END,
      });
    expect(seedTimeEntryError).toBeNull();
    const { error: seedEventError } = await userB.client
      .from("synced_events")
      .insert({
        user_id: userB.id,
        google_event_id: "s4-event",
        title: "Bの予定",
        start_at: START,
        end_at: END,
      });
    expect(seedEventError).toBeNull();

    const { data: otherTimeEntries, error: timeEntriesError } =
      await userA.client.from("time_entries").select().eq("user_id", userB.id);
    expect(timeEntriesError).toBeNull();
    expect(otherTimeEntries).toHaveLength(0);

    const { data: otherEvents, error: eventsError } = await userA.client
      .from("synced_events")
      .select()
      .eq("user_id", userB.id);
    expect(eventsError).toBeNull();
    expect(otherEvents).toHaveLength(0);

    const { error: crossInsertError } = await userA.client
      .from("time_entries")
      .insert({
        user_id: userB.id,
        title: "なりすまし",
        start_at: START,
        end_at: END,
      });
    expect(crossInsertError).not.toBeNull();
    expect(crossInsertError?.code).toBe("42501");
  });

  it("S5: authenticated からの google_tokens アクセスはすべて失敗し、service role では読み書きできる", async () => {
    const { data: selectData, error: selectError } = await userA.client
      .from("google_tokens")
      .select();
    // ポリシー不存在のため「行が返らない」または「権限エラー」のいずれかであること
    if (selectError === null) {
      expect(selectData).toHaveLength(0);
    } else {
      expect(selectError).not.toBeNull();
    }

    const { error: insertError } = await userA.client
      .from("google_tokens")
      .insert({ user_id: userA.id, refresh_token: "should-fail" });
    expect(insertError).not.toBeNull();

    const { error: adminUpsertError } = await admin
      .from("google_tokens")
      .upsert({ user_id: userA.id, refresh_token: "admin-token" });
    expect(adminUpsertError).toBeNull();

    const { data: adminRead, error: adminReadError } = await admin
      .from("google_tokens")
      .select("user_id, refresh_token")
      .eq("user_id", userA.id);
    expect(adminReadError).toBeNull();
    expect(adminRead).toHaveLength(1);
    expect(adminRead?.[0]?.refresh_token).toBe("admin-token");
  });

  it("S6: 実行中タイマーは1本のみ(2本目はunique violation、停止後は開始できる)", async () => {
    const { data: running, error: firstError } = await userA.client
      .from("time_entries")
      .insert({
        user_id: userA.id,
        title: "実行中タイマー",
        start_at: START,
        end_at: null,
      })
      .select()
      .single();
    expect(firstError).toBeNull();

    const { error: secondError } = await userA.client
      .from("time_entries")
      .insert({
        user_id: userA.id,
        title: "2本目のタイマー",
        start_at: START,
        end_at: null,
      });
    expect(secondError).not.toBeNull();
    expect(secondError?.code).toBe("23505");

    const { error: stopError } = await userA.client
      .from("time_entries")
      .update({ end_at: END })
      .eq("id", running.id);
    expect(stopError).toBeNull();

    const { error: restartError } = await userA.client
      .from("time_entries")
      .insert({
        user_id: userA.id,
        title: "新しいタイマー",
        start_at: END,
        end_at: null,
      });
    expect(restartError).toBeNull();

    // 後続シナリオに実行中タイマーを残さない
    const { error: cleanupError } = await userA.client
      .from("time_entries")
      .update({ end_at: END })
      .is("end_at", null);
    expect(cleanupError).toBeNull();
  });

  it("S7: end_at = start_at は成功し(ゼロ秒実績)、end_at < start_at はcheck violationで失敗する", async () => {
    const { error: zeroSecondError } = await userA.client
      .from("time_entries")
      .insert({
        user_id: userA.id,
        title: "ゼロ秒実績",
        start_at: START,
        end_at: START,
      });
    expect(zeroSecondError).toBeNull();

    const { error: invalidRangeError } = await userA.client
      .from("time_entries")
      .insert({
        user_id: userA.id,
        title: "開始より前に終了",
        start_at: END,
        end_at: START,
      });
    expect(invalidRangeError).not.toBeNull();
    expect(invalidRangeError?.code).toBe("23514");
  });

  it("S8: ユーザー削除で4テーブルすべての行がcascade削除される", async () => {
    const userC = await createTestUser(admin, "テスト三郎");
    const { error: timeEntryError } = await userC.client
      .from("time_entries")
      .insert({
        user_id: userC.id,
        title: "Cの実績",
        start_at: START,
        end_at: END,
      });
    expect(timeEntryError).toBeNull();
    const { error: eventError } = await userC.client
      .from("synced_events")
      .insert({
        user_id: userC.id,
        google_event_id: "s8-event",
        title: "Cの予定",
        start_at: START,
        end_at: END,
      });
    expect(eventError).toBeNull();
    const { error: tokenError } = await admin
      .from("google_tokens")
      .upsert({ user_id: userC.id, refresh_token: "c-token" });
    expect(tokenError).toBeNull();

    await deleteTestUser(admin, userC.id);

    const [profiles, tokens, events, entries] = await Promise.all([
      sql`select 1 from public.profiles where id = ${userC.id}`,
      sql`select 1 from public.google_tokens where user_id = ${userC.id}`,
      sql`select 1 from public.synced_events where user_id = ${userC.id}`,
      sql`select 1 from public.time_entries where user_id = ${userC.id}`,
    ]);
    expect(profiles).toHaveLength(0);
    expect(tokens).toHaveLength(0);
    expect(events).toHaveLength(0);
    expect(entries).toHaveLength(0);
  });

  it("S9: update で updated_at がトリガーにより更新される", async () => {
    const { data: inserted, error: insertError } = await userA.client
      .from("time_entries")
      .insert({
        user_id: userA.id,
        title: "updated_at検証",
        start_at: START,
        end_at: END,
      })
      .select("id, updated_at")
      .single();
    expect(insertError).toBeNull();
    if (!inserted) throw new Error("insert結果が取得できませんでした");

    await new Promise((resolve) => setTimeout(resolve, 50));

    const { data: updated, error: updateError } = await userA.client
      .from("time_entries")
      .update({ title: "updated_at検証(修正)" })
      .eq("id", inserted.id)
      .select("updated_at")
      .single();
    expect(updateError).toBeNull();
    if (!updated) throw new Error("update結果が取得できませんでした");
    expect(new Date(updated.updated_at).getTime()).toBeGreaterThan(
      new Date(inserted.updated_at).getTime(),
    );
  });

  it("S10: 同一ユーザー・同一 google_event_id の synced_events はunique violationで失敗する", async () => {
    const event = {
      user_id: userA.id,
      google_event_id: "s10-duplicate",
      title: "重複予定",
      start_at: START,
      end_at: END,
    };
    const { error: firstError } = await userA.client
      .from("synced_events")
      .insert(event);
    expect(firstError).toBeNull();

    const { error: duplicateError } = await userA.client
      .from("synced_events")
      .insert(event);
    expect(duplicateError).not.toBeNull();
    expect(duplicateError?.code).toBe("23505");
  });
});
