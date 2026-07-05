import { describe, expect, it } from "vitest";
import { buildGoogleSignInOptions } from "@/lib/supabase/auth-options";

// 仕様書: docs/specs/P1-1_Google認証.md S1

describe("Google認可オプション生成ヘルパー", () => {
  it("S1: access_type=offline / prompt=consent / readonlyスコープ / redirectTo がすべて含まれる", () => {
    const options = buildGoogleSignInOptions("https://plandiff.example.com");

    expect(options.provider).toBe("google");
    expect(options.options.redirectTo).toBe(
      "https://plandiff.example.com/auth/callback",
    );
    expect(options.options.scopes).toBe(
      "https://www.googleapis.com/auth/calendar.events.readonly",
    );
    expect(options.options.queryParams).toEqual({
      access_type: "offline",
      prompt: "consent",
    });
  });
});
