// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));
import { GET } from "@/app/api/cron/security-health/route";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it("S5: health requires cron authentication", async () => {
  vi.stubEnv("CRON_SECRET", "test-only");
  expect(
    (await GET(new Request("https://example.test/api/cron/security-health")))
      .status,
  ).toBe(401);
  expect(rpc).not.toHaveBeenCalled();
});
it.each([true, false])(
  "S5: health=%s returns only status without identifiers",
  async (healthy) => {
    vi.stubEnv("CRON_SECRET", "test-only");
    rpc.mockResolvedValue({ data: healthy, error: null });
    const response = await GET(
      new Request("https://example.test/api/cron/security-health", {
        headers: { authorization: "Bearer test-only" },
      }),
    );
    expect(response.status).toBe(healthy ? 200 : 503);
    expect(await response.json()).toEqual({ ok: healthy });
  },
);
