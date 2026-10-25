// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildContentSecurityPolicy,
  needsSessionRefresh,
} from "@/lib/security/headers";
import { readBoundedJson, proInterestSourceKey } from "@/lib/security/request";
import { validateRecurringRuleInput } from "@/lib/calendar/recurring";

afterEach(() => vi.unstubAllEnvs());
describe("S-5 security", () => {
  it("S8: production scripts require nonce; marketing avoids Auth", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    const csp = buildContentSecurityPolicy("nonce-value", false);
    const scripts = csp
      .split(";")
      .find((x) => x.trim().startsWith("script-src "))!;
    expect(scripts).toContain("'nonce-nonce-value'");
    expect(scripts).not.toContain("unsafe-inline");
    expect(scripts).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("https://example.supabase.co");
    expect(needsSessionRefresh("/pricing")).toBe(false);
    expect(needsSessionRefresh("/api/pro-interest")).toBe(false);
    expect(needsSessionRefresh("/calendar")).toBe(true);
  });
  it("S2: bounded JSON checks actual bytes and rejects invalid UTF-8", async () => {
    const req = (body: BodyInit) =>
      new Request("https://example.test", { method: "POST", body });
    expect(
      await readBoundedJson(req('"' + "a".repeat(1022) + '"'), 1024),
    ).toMatchObject({ ok: true });
    expect(
      await readBoundedJson(req('"' + "a".repeat(1023) + '"'), 1024),
    ).toMatchObject({ ok: false, status: 413 });
    expect(
      await readBoundedJson(req(new Uint8Array([0xff])), 1024),
    ).toMatchObject({ ok: false, status: 400 });
  });
  it("S3: source key rotates and fails closed without trusted deployment", () => {
    vi.stubEnv("PRO_INTEREST_HMAC_SECRET", "a".repeat(64));
    vi.stubEnv("VERCEL", "1");
    const request = (ip: string) =>
      new Request("https://example.test", {
        headers: { "x-vercel-forwarded-for": ip },
      });
    const a = proInterestSourceKey(request("192.0.2.1"), 60_000);
    expect(a).toBe(proInterestSourceKey(request("192.0.2.1"), 60_000));
    expect(a).not.toBe(proInterestSourceKey(request("192.0.2.2"), 60_000));
    expect(a).not.toBe(proInterestSourceKey(request("192.0.2.1"), 120_000));
    expect(proInterestSourceKey(request("bad"), 60_000)).toBeNull();
    vi.stubEnv("PRO_INTEREST_HMAC_SECRET", "");
    expect(proInterestSourceKey(request("192.0.2.1"), 60_000)).toBeNull();
  });
  it.each([null, [], { title: 1 }, { title: "test", pattern: "invalid" }])(
    "S11: malformed recurring input is rejected without throwing",
    (input) => {
      expect(validateRecurringRuleInput(input as never)).toBeNull();
    },
  );
});

it("S11: impossible dates and invalid times/patterns are rejected", () => {
  const good = {
    title: "test",
    pattern: "daily" as const,
    weekdays: null,
    startTime: "09:00",
    endTime: "10:00",
    timezone: "Asia/Tokyo",
    startsOn: "2026-10-25",
    endsOn: null,
  };
  expect(validateRecurringRuleInput(good)).not.toBeNull();
  for (const patch of [
    { startsOn: "2026-02-30" },
    { startTime: "29:00" },
    { endsOn: "2026-02-30" },
    { weekdays: "bad" },
    { pattern: "bad" },
  ]) {
    expect(
      validateRecurringRuleInput({ ...good, ...patch } as never),
    ).toBeNull();
  }
});
