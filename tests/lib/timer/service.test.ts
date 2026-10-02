import { afterEach, describe, expect, it, vi } from "vitest";
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

describe("P17-1 タイマーRPC失敗ログ", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(["start_timer", "stop_timer"] as const)(
    "S1: %s の有効なDBエラーコードを安全な形式で1回記録する",
    async (operation) => {
      const { client, rpc } = clientMock(true, false);
      rpc.mockResolvedValueOnce({
        error: { code: "23502", message: "private database message" },
      } as never);
      const log = vi.spyOn(console, "error").mockImplementation(() => {});

      const result =
        operation === "start_timer"
          ? await startTimer(client, {
              title: "秘密の予定",
              googleEventId: "private-event-id",
            })
          : await stopTimer(client);

      expect(result).toEqual({ ok: false });
      expect(log).toHaveBeenCalledExactlyOnceWith("timer_rpc_failed", {
        operation,
        code: "23502",
      });
    },
  );

  it.each([
    {
      label: "コード欠落",
      error: {
        message: "private message",
        details: "private details",
        hint: "private hint",
      },
      expectedCode: "UNKNOWN",
    },
    {
      label: "不正コード",
      error: {
        code: "23-02",
        message: "private message",
        details: "private details",
        hint: "private hint",
      },
      expectedCode: "UNKNOWN",
    },
    {
      label: "有効コード",
      error: {
        code: "23502",
        message: "private message",
        details: "private details",
        hint: "private hint",
      },
      expectedCode: "23502",
    },
  ])(
    "S2: $label でも許可項目だけを記録する",
    async ({ error, expectedCode }) => {
      const { client, rpc } = clientMock(true, false);
      rpc.mockResolvedValueOnce({ error } as never);
      const log = vi.spyOn(console, "error").mockImplementation(() => {});

      expect(
        await startTimer(client, {
          title: "秘密の予定",
          googleEventId: "private-event-id",
        }),
      ).toEqual({ ok: false });
      expect(log).toHaveBeenCalledExactlyOnceWith("timer_rpc_failed", {
        operation: "start_timer",
        code: expectedCode,
      });
      const logged = JSON.stringify(log.mock.calls);
      for (const secret of [
        "private message",
        "private details",
        "private hint",
        "秘密の予定",
        "private-event-id",
        "user-1",
      ]) {
        expect(logged).not.toContain(secret);
      }
    },
  );

  it.each(["start_timer", "stop_timer"] as const)(
    "S3: %s が例外を投げてもコードをUNKNOWNとして一度記録する",
    async (operation) => {
      const { client, rpc } = clientMock(true, false);
      const exception = Object.assign(new Error("private exception message"), {
        code: "23502",
      });
      exception.stack = "private exception stack";
      rpc.mockRejectedValueOnce(exception);
      const log = vi.spyOn(console, "error").mockImplementation(() => {});

      const result =
        operation === "start_timer"
          ? await startTimer(client, {
              title: "秘密の予定",
              googleEventId: "private-event-id",
            })
          : await stopTimer(client);

      expect(result).toEqual({ ok: false });
      expect(log).toHaveBeenCalledExactlyOnceWith("timer_rpc_failed", {
        operation,
        code: "UNKNOWN",
      });
      const logged = JSON.stringify(log.mock.calls);
      expect(logged).not.toContain("private exception message");
      expect(logged).not.toContain("private exception stack");
    },
  );

  it("S4: console.error自体が失敗しても再試行せず失敗結果を返す", async () => {
    const { client, rpc } = clientMock(true, false);
    rpc.mockResolvedValueOnce({ error: { code: "23502" } } as never);
    const log = vi.spyOn(console, "error").mockImplementation(() => {
      throw new Error("logger failed");
    });

    expect(
      await startTimer(client, { title: "予定", googleEventId: null }),
    ).toEqual({ ok: false });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("start_timer", {
      p_title: "予定",
      p_google_event_id: null,
    });
    expect(log).toHaveBeenCalledExactlyOnceWith("timer_rpc_failed", {
      operation: "start_timer",
      code: "23502",
    });
  });

  it("S6: RPC成功時と未認証時には失敗イベントを記録しない", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const start = clientMock(true, false);
    const stop = clientMock(true, false);
    const unauthenticated = clientMock(false, false);

    expect(
      await startTimer(start.client, { title: "予定", googleEventId: null }),
    ).toEqual({ ok: true });
    expect(await stopTimer(stop.client)).toEqual({ ok: true });
    expect(
      await startTimer(unauthenticated.client, {
        title: "予定",
        googleEventId: null,
      }),
    ).toEqual({ ok: false });
    expect(await stopTimer(unauthenticated.client)).toEqual({ ok: false });

    expect(log).not.toHaveBeenCalled();
    expect(start.rpc).toHaveBeenCalledExactlyOnceWith("start_timer", {
      p_title: "予定",
      p_google_event_id: null,
    });
    expect(stop.rpc).toHaveBeenCalledExactlyOnceWith("stop_timer");
    expect(unauthenticated.rpc).not.toHaveBeenCalled();
  });
});
