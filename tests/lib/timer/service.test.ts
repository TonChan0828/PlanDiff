import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { startTimer, stopTimer } from "@/lib/timer/service";

function clientMock(authenticated: boolean, fail: boolean) {
  const rpc = vi
    .fn()
    .mockResolvedValue({ error: fail ? { message: "RPC failed" } : null });
  const from = vi.fn();
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: authenticated ? { id: "user-1" } : null },
      }),
    },
    rpc,
    from,
  } as unknown as SupabaseClient;
  return { client, rpc, from };
}

describe("P16-data タイマーRPC", () => {
  it.each([false, true])(
    "D7: DBエラー=%s の開始/停止を1回のRPCで完結する",
    async (fail) => {
      const start = clientMock(true, fail);
      expect(
        await startTimer(start.client, {
          title: "設計",
          googleEventId: "event-1",
        }),
      ).toEqual({ ok: !fail });
      expect(start.rpc).toHaveBeenCalledExactlyOnceWith("start_timer", {
        p_title: "設計",
        p_google_event_id: "event-1",
      });
      expect(start.from).not.toHaveBeenCalled();
      const stop = clientMock(true, fail);
      expect(await stopTimer(stop.client)).toEqual({ ok: !fail });
      expect(stop.rpc).toHaveBeenCalledExactlyOnceWith("stop_timer");
      expect(stop.from).not.toHaveBeenCalled();
    },
  );

  it("D8: 未認証では開始/停止ともRPCやテーブルを書き込まない", async () => {
    const { client, rpc, from } = clientMock(false, false);
    expect(
      await startTimer(client, { title: "設計", googleEventId: null }),
    ).toEqual({ ok: false });
    expect(await stopTimer(client)).toEqual({ ok: false });
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("RPC呼び出し自体が失敗した場合も ok:false を返す", async () => {
    const { client, rpc, from } = clientMock(true, false);
    rpc.mockRejectedValueOnce(new Error("connection failed"));

    expect(
      await startTimer(client, { title: "設計", googleEventId: null }),
    ).toEqual({ ok: false });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("start_timer", {
      p_title: "設計",
      p_google_event_id: null,
    });
    expect(from).not.toHaveBeenCalled();
  });
});
