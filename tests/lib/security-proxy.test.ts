// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const auth = vi.hoisted(() => ({
  getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
}));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth }) }));
import { proxy } from "@/proxy";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it("S8: nonce and CSP are overwritten; each request has fresh nonce; public pages skip Auth", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  const request = () =>
    new NextRequest("https://example.test/pricing", {
      headers: {
        "x-nonce": "attacker",
        "content-security-policy": "script-src * 'unsafe-inline'",
      },
    });
  const a = await proxy(request()),
    b = await proxy(request());
  const nonce = a.headers.get("x-middleware-request-x-nonce");
  expect(nonce).not.toBe("attacker");
  expect(nonce).toBeTruthy();
  expect(nonce).not.toBe(b.headers.get("x-middleware-request-x-nonce"));
  expect(a.headers.get("content-security-policy")).toContain(
    `'nonce-${nonce}'`,
  );
  expect(a.headers.get("cache-control")).toContain("no-store");
  expect(auth.getUser).not.toHaveBeenCalled();
});
it("S8: protected pages still refresh authentication", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-key");
  await proxy(new NextRequest("https://example.test/calendar"));
  expect(auth.getUser).toHaveBeenCalledOnce();
});
