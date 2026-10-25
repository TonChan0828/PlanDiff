import { expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteRecurringOccurrence } from "@/lib/calendar/recurring";
import { startTimer, updateTimeEntry } from "@/lib/timer/service";
it.each([null, { id: "own-exception" }])(
  "S7: duplicate requires a visible owned exception (%s)",
  async (existing) => {
    const remove = vi.fn();
    const query = {
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: existing, error: null }),
    };
    const events = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [
            {
              id: "event",
              source: "app",
              google_event_id:
                "rec:12345678-1234-1234-1234-123456789012:2026-10-25",
            },
          ],
          error: null,
        }),
      }),
      delete: remove,
    };
    remove.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi
            .fn()
            .mockResolvedValue({ data: [{ id: "event" }], error: null }),
        }),
      }),
    });
    const client = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "owner" } } }),
      },
      from: vi.fn((table: string) =>
        table === "synced_events"
          ? events
          : {
              insert: vi.fn().mockResolvedValue({ error: { code: "23505" } }),
              select: vi.fn().mockReturnValue(query),
            },
      ),
    } as unknown as SupabaseClient;
    expect(await deleteRecurringOccurrence(client, "event")).toEqual({
      ok: !!existing,
    });
    expect(remove).toHaveBeenCalledTimes(existing ? 1 : 0);
  },
);
it("S11: malformed timer input never calls DB or throws", async () => {
  const client = {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "owner" } } }),
    },
  } as unknown as SupabaseClient;
  for (const value of [
    null,
    [],
    { title: 1 },
    { title: "x", googleEventId: {} },
  ])
    expect(await startTimer(client, value as never)).toEqual({ ok: false });
  expect(
    await updateTimeEntry(client, "id", {
      title: "x",
      startAt: "2026-02-30T09:00:00Z",
      endAt: "2026-03-01T09:00:00Z",
    }),
  ).toEqual({ ok: false });
  expect(client.rpc).not.toHaveBeenCalled();
  expect(client.from).not.toHaveBeenCalled();
});
