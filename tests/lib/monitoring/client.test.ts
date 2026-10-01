import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("ブラウザ監視(P16-ops)", () => {
  it("O3: 重複を送信せず、通信失敗でも例外を出さない", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network"));
    vi.stubGlobal("fetch", fetchMock);
    const { reportClientError } = await import("@/lib/monitoring/client");
    expect(() => {
      reportClientError(new TypeError("secret"), "boundary");
      reportClientError(new TypeError("secret"), "boundary");
    }).not.toThrow();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = fetchMock.mock.calls[0]![1].body;
    expect(body).not.toContain("secret");
  });
});
