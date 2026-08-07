import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addDays, addHours, startOfDay } from "date-fns";
import { fetchSyncedEventsInRange } from "@/lib/calendar/events";
import { fetchTimeEntriesInRange } from "@/lib/timer/entries";
import {
  createAdminClient,
  createDbSql,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "./helpers";

// 仕様書: docs/specs/P6-2_データ増に耐えるクエリとインデックス.md S4〜S15

const admin = createAdminClient();
let userA: TestUser;
let userB: TestUser;

const BASE = startOfDay(addDays(new Date(), -100));
const RANGE = {
  timeMin: addDays(BASE, 0).toISOString(),
  timeMax: addDays(BASE, 7).toISOString(),
};

async function seedEvent(
  user: TestUser,
  googleEventId: string,
  startAt: Date,
  endAt: Date,
): Promise<void> {
  const { error } = await admin.from("synced_events").insert({
    user_id: user.id,
    google_event_id: googleEventId,
    title: googleEventId,
    start_at: startAt.toISOString(),
    end_at: endAt.toISOString(),
    synced_at: new Date().toISOString(),
  });
  expect(error).toBeNull();
}

async function idsInRange(user: TestUser): Promise<string[]> {
  const events = await fetchSyncedEventsInRange(user.client, RANGE);
  return events.map((event) => event.googleEventId);
}

beforeAll(async () => {
  userA = await createTestUser(admin, "重なり判定A");
  userB = await createTestUser(admin, "重なり判定B");
});

afterAll(async () => {
  await deleteTestUser(admin, userA.id);
  await deleteTestUser(admin, userB.id);
});

beforeEach(async () => {
  for (const user of [userA, userB]) {
    await admin.from("synced_events").delete().eq("user_id", user.id);
    await admin.from("time_entries").delete().eq("user_id", user.id);
  }
});

describe("期間との重なり判定(S4〜S8)", () => {
  it("S4: 期間と重なる予定だけが返る", async () => {
    await seedEvent(userA, "inside", addDays(BASE, 2), addDays(BASE, 3));
    await seedEvent(userA, "before", addDays(BASE, -5), addDays(BASE, -4));
    await seedEvent(userA, "after", addDays(BASE, 10), addDays(BASE, 11));
    // 期間の境界をまたぐもの(前後どちらも重なる)
    await seedEvent(
      userA,
      "straddle-start",
      addDays(BASE, -1),
      addDays(BASE, 1),
    );
    await seedEvent(userA, "straddle-end", addDays(BASE, 6), addDays(BASE, 9));

    const ids = await idsInRange(userA);

    expect(ids.sort()).toEqual(
      ["inside", "straddle-end", "straddle-start"].sort(),
    );
  });

  it("S5: end_at が期間開始ちょうどの予定は返らない(従来と同じ)", async () => {
    await seedEvent(userA, "ends-at-min", addDays(BASE, -1), addDays(BASE, 0));

    expect(await idsInRange(userA)).toEqual([]);
  });

  it("S6: start_at が期間終了ちょうどの予定は返らない(従来と同じ)", async () => {
    await seedEvent(userA, "starts-at-max", addDays(BASE, 7), addDays(BASE, 8));

    expect(await idsInRange(userA)).toEqual([]);
  });

  it("S7: 期間全体をまたぐ30日間の予定が返る(下限を足す案では取りこぼす)", async () => {
    await seedEvent(userA, "long", addDays(BASE, -15), addDays(BASE, 15));

    expect(await idsInRange(userA)).toEqual(["long"]);
  });

  it("S8: ゼロ長(start_at == end_at)の予定が期間内なら返る", async () => {
    const at = addHours(addDays(BASE, 2), 9);
    await seedEvent(userA, "zero-length", at, at);

    expect(await idsInRange(userA)).toEqual(["zero-length"]);
  });
});

describe("実績側の重なり判定(S9・S10)", () => {
  it("S9: 実行中タイマー(end_at が NULL)は確定済み実績に含めない", async () => {
    const { error: doneError } = await admin.from("time_entries").insert({
      user_id: userA.id,
      google_event_id: null,
      title: "確定済み",
      start_at: addHours(addDays(BASE, 2), 9).toISOString(),
      end_at: addHours(addDays(BASE, 2), 10).toISOString(),
    });
    expect(doneError).toBeNull();
    const { error: runningError } = await admin.from("time_entries").insert({
      user_id: userA.id,
      google_event_id: null,
      title: "実行中",
      start_at: addHours(addDays(BASE, 2), 11).toISOString(),
      end_at: null,
    });
    expect(runningError).toBeNull();

    const entries = await fetchTimeEntriesInRange(userA.client, RANGE);

    expect(entries.map((entry) => entry.title)).toEqual(["確定済み"]);
  });

  it("S10: 他ユーザーの行は返らない(RLSがそのまま効く)", async () => {
    await seedEvent(userA, "a-event", addDays(BASE, 2), addDays(BASE, 3));
    await seedEvent(userB, "b-event", addDays(BASE, 2), addDays(BASE, 3));

    expect(await idsInRange(userB)).toEqual(["b-event"]);
  });
});

describe("実行計画(S11)", () => {
  it("S11: 重なり判定が GiST インデックスを使い、Seq Scan にならない", async () => {
    const sql = createDbSql();
    try {
      // 統計情報がないとプランナが小さい表を Seq Scan するため、十分な行数を投入する
      await sql`
        insert into public.synced_events (user_id, google_event_id, title, start_at, end_at)
        select ${userA.id}::uuid, 'perf-' || g, 'perf',
               ${BASE.toISOString()}::timestamptz - (g || ' hours')::interval,
               ${BASE.toISOString()}::timestamptz - (g || ' hours')::interval + interval '30 min'
        from generate_series(1, 12000) g
      `;
      await sql`analyze public.synced_events`;

      const plan = await sql`
        explain (analyze, costs off)
        select id from public.synced_events
        where user_id = ${userA.id}::uuid
          and span && tstzrange(${RANGE.timeMin}::timestamptz, ${RANGE.timeMax}::timestamptz, '[)')
      `;
      const text = plan.map((row) => row["QUERY PLAN"] as string).join("\n");

      expect(text).toContain("synced_events_user_span_idx");
      expect(text).not.toContain("Seq Scan");
    } finally {
      await sql.end();
    }
  });
});

describe("スキーマ(S12〜S15)", () => {
  it("S12: span は生成列で、start_at / end_at の更新に追従する", async () => {
    await seedEvent(userA, "gen", addDays(BASE, 2), addDays(BASE, 3));

    const sql = createDbSql();
    try {
      const before = await sql`
        select span::text from public.synced_events
        where user_id = ${userA.id}::uuid and google_event_id = 'gen'
      `;
      expect(before[0]!.span).toContain(
        addDays(BASE, 2).toISOString().slice(0, 10),
      );

      await sql`
        update public.synced_events
        set end_at = ${addDays(BASE, 5).toISOString()}::timestamptz
        where user_id = ${userA.id}::uuid and google_event_id = 'gen'
      `;
      const after = await sql`
        select span::text from public.synced_events
        where user_id = ${userA.id}::uuid and google_event_id = 'gen'
      `;
      expect(after[0]!.span).toContain(
        addDays(BASE, 5).toISOString().slice(0, 10),
      );
    } finally {
      await sql.end();
    }
  });

  it("S13: 追加したインデックスがすべて存在する", async () => {
    const sql = createDbSql();
    try {
      const rows = await sql`
        select indexname from pg_indexes
        where schemaname = 'public' and indexname = any(${[
          "synced_events_user_span_idx",
          "time_entries_user_span_idx",
          "synced_events_user_source_start_idx",
          "synced_events_gei_pattern_idx",
          "pro_interest_events_type_created_idx",
        ]})
      `;
      expect(rows.map((row) => row.indexname).sort()).toEqual(
        [
          "pro_interest_events_type_created_idx",
          "synced_events_gei_pattern_idx",
          "synced_events_user_source_start_idx",
          "synced_events_user_span_idx",
          "time_entries_user_span_idx",
        ].sort(),
      );
    } finally {
      await sql.end();
    }
  });

  it("S14: 全ポリシーが authenticated ロールに限定されている(PUBLIC ではない)", async () => {
    const sql = createDbSql();
    try {
      const rows = await sql`
        select c.relname as table_name, p.polname as policy_name,
               p.polroles::regrole[]::text[] as roles
        from pg_policy p
        join pg_class c on c.oid = p.polrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
      `;
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.roles).toEqual(["authenticated"]);
      }
    } finally {
      await sql.end();
    }
  });

  it("S15: TO authenticated 付与後も本人の行だけが読める", async () => {
    await seedEvent(userA, "a-only", addDays(BASE, 2), addDays(BASE, 3));

    const asA = await idsInRange(userA);
    const asB = await idsInRange(userB);

    expect(asA).toEqual(["a-only"]);
    expect(asB).toEqual([]);
  });
});
