import { afterEach, describe, expect, it, vi } from "vitest";
import { buildErrorEvent } from "@/lib/monitoring/events";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});
const url = "http://localhost:3000/api/monitoring/errors";
function request(body: unknown, origin = "http://localhost:3000") {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

describe("監視API(P16-ops)", () => {
  it("O4: 同一オリジンの安全な報告を構造化ログへ記録する", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await import("@/app/api/monitoring/errors/route");
    const event = buildErrorEvent(
      new TypeError("secret"),
      "boundary",
      "/track",
    );
    expect((await POST(request(event))).status).toBe(204);
    expect(log).toHaveBeenCalledWith(JSON.stringify(event));
  });
  it("O5a: Content-Lengthなしでも上限を超えたstreamを読み取り中に打ち切る", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("x".repeat(1025)));
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
      },
      body,
      duplex: "half",
    } as RequestInit);
    const { POST } = await import("@/app/api/monitoring/errors/route");
    expect((await POST(request)).status).toBe(413);
    expect(cancelled).toBe(true);
  });
  it("O5: 不正payload・別オリジン・件数超過を拒否する", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await import("@/app/api/monitoring/errors/route");
    const event = buildErrorEvent(new Error(), "window", "/calendar");
    expect((await POST(request({ ...event, message: "secret" }))).status).toBe(
      400,
    );
    expect((await POST(request(event, "https://evil.example"))).status).toBe(
      403,
    );
    expect(log).not.toHaveBeenCalled();
    for (let index = 0; index < 60; index++)
      expect((await POST(request(event))).status).toBe(204);
    expect((await POST(request(event))).status).toBe(429);
  });
});
