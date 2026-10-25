import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createAdminClient,
  createAnonClient,
  createDbSql,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "./helpers";
import {
  createRecurringRule,
  deleteRecurringOccurrence,
  materializeRecurringInstances,
} from "@/lib/calendar/recurring";
const admin = createAdminClient();
const sql = createDbSql();
let a: TestUser, b: TestUser;
const key = (n: number) => n.toString(16).padStart(64, "0");
beforeAll(async () => {
  a = await createTestUser(admin);
  b = await createTestUser(admin);
});
beforeEach(async () => {
  await sql`truncate private.pro_interest_limits`;
  await sql`delete from public.pro_interest_events`;
  // Keep each concurrency scenario inside one minute.
  const seconds = new Date().getSeconds();
  if (seconds >= 55)
    await new Promise((resolve) => setTimeout(resolve, (61 - seconds) * 1000));
});
afterAll(async () => {
  if (a) await deleteTestUser(admin, a.id);
  if (b) await deleteTestUser(admin, b.id);
  await sql.end();
});
describe("S-5 database security", () => {
  it("S4: concurrent service calls cannot bypass per-source limits", async () => {
    const responses = await Promise.all(
      Array.from({ length: 25 }, () =>
        admin.rpc("record_pro_interest_limited", {
          p_event_type: "view",
          p_source_key: key(1),
        }),
      ),
    );
    for (const r of responses) expect(r.error).toBeNull();
    expect(responses.filter((r) => r.data?.[0]?.allowed)).toHaveLength(20);
    expect(
      (
        await sql`select count(*)::integer n from public.pro_interest_events`
      )[0]!.n,
    ).toBe(20);
  });
  it("S4: global cap and expired time windows", async () => {
    await sql`insert into private.pro_interest_limits values(date_trunc('minute',clock_timestamp()),'global',599)`;
    const responses = await Promise.all(
      [2, 3].map((n) =>
        admin.rpc("record_pro_interest_limited", {
          p_event_type: "click",
          p_source_key: key(n),
        }),
      ),
    );
    responses.forEach((r) => expect(r.error).toBeNull());
    expect(responses.filter((r) => r.data?.[0]?.allowed)).toHaveLength(1);
    await sql`update private.pro_interest_limits set window_at=window_at-interval '1 minute'`;
    const again = await admin.rpc("record_pro_interest_limited", {
      p_event_type: "view",
      p_source_key: key(2),
    });
    expect(again.error).toBeNull();
    expect(again.data[0].allowed).toBe(true);
  });
  it("S5: cleanup removes expired keys and overdue cleanup fails closed", async () => {
    await sql`insert into private.pro_interest_limits values(clock_timestamp()-interval '11 minutes',${key(9)},1)`;
    const stopped = await admin.rpc("record_pro_interest_limited", {
      p_event_type: "view",
      p_source_key: key(1),
    });
    expect(stopped.error?.code).toBe("55000");
    await sql`select private.purge_pro_interest_limits()`;
    expect(await sql`select * from private.pro_interest_limits`).toHaveLength(
      0,
    );
    for (const client of [createAnonClient(), a.client]) {
      const result = await client.rpc("record_pro_interest_limited", {
        p_event_type: "view",
        p_source_key: key(1),
      });
      expect(result.error).not.toBeNull();
    }
    const permissions =
      await sql`select has_table_privilege('authenticated','private.pro_interest_limits','select') allowed`;
    expect(permissions[0]!.allowed).toBe(false);
  });
  it("S6: cross-owner exceptions are denied, including updates; own deletion remains durable", async () => {
    const input = {
      title: "Security rule",
      pattern: "daily" as const,
      weekdays: null,
      startTime: "09:00",
      endTime: "09:30",
      timezone: "Asia/Tokyo",
      startsOn: "2026-10-01",
      endsOn: null,
    };
    expect(await createRecurringRule(a.client, input)).toEqual({ ok: true });
    expect(await createRecurringRule(b.client, input)).toEqual({ ok: true });
    const ar = await a.client.from("recurring_rules").select("id").single();
    const br = await b.client.from("recurring_rules").select("id").single();
    expect(ar.error).toBeNull();
    expect(br.error).toBeNull();
    const insert = await a.client.from("recurring_exceptions").insert({
      rule_id: br.data!.id,
      user_id: a.id,
      occurrence_date: "2026-10-26",
    });
    expect(insert.error).not.toBeNull();
    const own = await a.client
      .from("recurring_exceptions")
      .insert({
        rule_id: ar.data!.id,
        user_id: a.id,
        occurrence_date: "2026-10-26",
      })
      .select("id")
      .single();
    expect(own.error).toBeNull();
    const update = await a.client
      .from("recurring_exceptions")
      .update({ rule_id: br.data!.id })
      .eq("id", own.data!.id);
    expect(update.error).not.toBeNull();
    const base = new Date("2026-10-26T03:00:00Z");
    await materializeRecurringInstances(a.client, base);
    const event = await a.client
      .from("synced_events")
      .select("id,google_event_id")
      .like("google_event_id", `rec:${ar.data!.id}:%`)
      .limit(1)
      .single();
    expect(event.error).toBeNull();
    expect(await deleteRecurringOccurrence(a.client, event.data!.id)).toEqual({
      ok: true,
    });
    await materializeRecurringInstances(a.client, base);
    const missing = await a.client
      .from("synced_events")
      .select("id")
      .eq("google_event_id", event.data!.google_event_id);
    expect(missing.data).toHaveLength(0);
  });
  it("S12: direct DB writes reject new long titles but preserve old snapshots", async () => {
    const bad = await a.client.from("time_entries").insert({
      user_id: a.id,
      title: "x".repeat(201),
      start_at: new Date().toISOString(),
      end_at: new Date().toISOString(),
    });
    expect(bad.error?.code).toBe("23514");
    const id = crypto.randomUUID();
    await sql.begin(async (tx) => {
      await tx`set local session_replication_role='replica'`;
      await tx`insert into public.time_entries(id,user_id,title,start_at,end_at) values(${id},${a.id},${"x".repeat(201)},now(),now())`;
    });
    expect(
      (
        await a.client
          .from("time_entries")
          .update({ end_at: new Date().toISOString() })
          .eq("id", id)
      ).error,
    ).toBeNull();
    expect(
      (
        await a.client.rpc("start_timer", {
          p_title: "x".repeat(201),
          p_google_event_id: null,
        })
      ).error,
    ).toBeNull();
  });
});
