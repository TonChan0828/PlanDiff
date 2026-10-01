import { describe, expect, it } from "vitest";
import { buildErrorEvent, isClientErrorEvent } from "@/lib/monitoring/events";

describe("監視イベント(P16-ops)", () => {
  it("O1: 秘密情報を含むエラーから安全な識別情報だけを生成する", () => {
    const error = Object.assign(
      new TypeError("secret token=abc email=user@example.com"),
      { digest: "f00d1234" },
    );
    const event = buildErrorEvent(error, "boundary", "/calendar?token=secret");
    expect(event).toEqual({
      event: "application_error",
      source: "boundary",
      route: "/calendar",
      errorName: "TypeError",
      digest: "f00d1234",
    });
    expect(JSON.stringify(event)).not.toContain("secret");
    expect(JSON.stringify(event)).not.toContain("user@example.com");
  });
  it("O2: 不明なURLと任意のエラー名・digestを記録しない", () => {
    const event = buildErrorEvent(
      { name: "secret", digest: "token@example.com" },
      "window",
      "/users/secret?token=abc",
    );
    expect(event.route).toBe("unknown");
    expect(event.errorName).toBe("Error");
    expect(event.digest).toBeUndefined();
    expect(isClientErrorEvent(event)).toBe(true);
    expect(isClientErrorEvent({ ...event, message: "secret" })).toBe(false);
    expect(
      isClientErrorEvent(buildErrorEvent(new Error(), "server", "/calendar")),
    ).toBe(false);
  });
});
