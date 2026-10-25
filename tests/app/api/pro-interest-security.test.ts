// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const save = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ ok: true, allowed: true, retryAfter: 0 }),
);
vi.mock("@/lib/supabase/admin", () => ({ recordProInterestEvent: save }));
import { POST } from "@/app/api/pro-interest/route";
beforeEach(() => {
  save.mockClear();
  save.mockResolvedValue({ ok: true, allowed: true, retryAfter: 0 });
  vi.stubEnv("APP_ORIGIN", "https://example.test");
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("PRO_INTEREST_HMAC_SECRET", "x".repeat(64));
});
afterEach(() => vi.unstubAllEnvs());
const req = (body = '{"event":"view"}', headers: Record<string, string> = {}) =>
  new Request("https://example.test/api/pro-interest", {
    method: "POST",
    body,
    headers: {
      origin: "https://example.test",
      "content-type": "application/json",
      "x-vercel-forwarded-for": "192.0.2.1",
      ...headers,
    },
  });
it("S1: valid request is saved once", async () => {
  expect((await POST(req())).status).toBe(204);
  expect(save).toHaveBeenCalledOnce();
});
it.each([
  [req(undefined, { origin: "https://external.test" }), 403],
  [req(undefined, { "content-type": "text/plain" }), 415],
  [req('{"event":"view","extra":1}'), 400],
  [req("null"), 400],
  [req("{"), 400],
  [req("a".repeat(1025)), 413],
])("S1: invalid request rejected before DB (%s)", async (request, status) => {
  expect((await POST(request as Request)).status).toBe(status);
  expect(save).not.toHaveBeenCalled();
});
it("S1: limit returns Retry-After; DB unavailable returns 503", async () => {
  save.mockResolvedValueOnce({ ok: true, allowed: false, retryAfter: 42 });
  const response = await POST(req());
  expect(response.status).toBe(429);
  expect(response.headers.get("retry-after")).toBe("42");
  save.mockResolvedValueOnce({ ok: false });
  expect((await POST(req())).status).toBe(503);
});
