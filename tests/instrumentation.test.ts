import { afterEach, expect, it, vi } from "vitest";
import { onRequestError } from "@/instrumentation";

afterEach(() => vi.restoreAllMocks());
it("O6: サーバーエラーはrequestの秘密情報を除外してログへ記録する", () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  onRequestError(
    Object.assign(new Error("secret"), { digest: "1234" }),
    {
      path: "/calendar?token=secret",
      method: "GET",
      headers: { cookie: "secret" },
    },
    {
      routerKind: "App Router",
      routePath: "/calendar",
      routeType: "render",
      renderSource: "react-server-components",
      revalidateReason: undefined,
    },
  );
  expect(log).toHaveBeenCalledWith(
    JSON.stringify({
      event: "application_error",
      source: "server",
      route: "/calendar",
      errorName: "Error",
      digest: "1234",
    }),
  );
});
