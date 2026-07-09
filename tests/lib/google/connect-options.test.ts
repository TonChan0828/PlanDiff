import { describe, expect, it } from "vitest";
import { buildGoogleAuthorizationUrl } from "@/lib/google/connect-options";

// 仕様書: docs/specs/P1-3_メール認証とGoogle任意連携.md S15

describe("buildGoogleAuthorizationUrl", () => {
  it("S15: access_type=offline / prompt=consent / readonlyスコープ / redirect_uri / state がすべて含まれる", () => {
    const url = buildGoogleAuthorizationUrl({
      origin: "https://plandiff.example.com",
      state: "state-value-123",
      clientId: "client-id-abc",
    });

    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(parsed.searchParams.get("client_id")).toBe("client-id-abc");
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://plandiff.example.com/api/google/callback",
    );
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("scope")).toBe(
      "https://www.googleapis.com/auth/calendar.events.readonly",
    );
    expect(parsed.searchParams.get("access_type")).toBe("offline");
    expect(parsed.searchParams.get("prompt")).toBe("consent");
    expect(parsed.searchParams.get("state")).toBe("state-value-123");
  });
});
