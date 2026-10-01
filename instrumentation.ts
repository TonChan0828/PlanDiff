import type { Instrumentation } from "next";
import { buildErrorEvent } from "@/lib/monitoring/events";

export const onRequestError: Instrumentation.onRequestError = (
  error,
  _request,
  context,
) => {
  // Never record request URL/query, headers, or error messages; routePath is Next's static route pattern.
  console.error(
    JSON.stringify(buildErrorEvent(error, "server", context.routePath)),
  );
};
