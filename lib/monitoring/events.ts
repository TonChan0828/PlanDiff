export const CLIENT_ERROR_SOURCES = [
  "boundary",
  "window",
  "unhandledrejection",
] as const;
export type ClientErrorSource = (typeof CLIENT_ERROR_SOURCES)[number];
export type ErrorSource = ClientErrorSource | "server";

export type ApplicationErrorEvent = {
  event: "application_error";
  source: ErrorSource;
  route: string;
  errorName: string;
  digest?: string;
};

const SAFE_ROUTES = new Set([
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/confirm",
  "/calendar",
  "/track",
  "/summary",
  "/settings",
  "/onboarding",
  "/pricing",
  "/terms",
  "/privacy",
  "/api/calendar/sync",
  "/api/google/connect",
  "/api/google/callback",
  "/api/notifications/subscribe",
  "/api/cron/stale-timers",
  "/api/pro-interest",
  "/api/monitoring/errors",
]);
const SAFE_ERROR_NAMES = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "URIError",
  "EvalError",
]);
const DIGEST_PATTERN = /^[a-f0-9]{4,64}$/i;

function safeRoute(path: string): string {
  const pathname = path.split(/[?#]/, 1)[0] ?? "";
  return SAFE_ROUTES.has(pathname) ? pathname : "unknown";
}

export function buildErrorEvent(
  error: unknown,
  source: ErrorSource,
  path: string,
): ApplicationErrorEvent {
  const record =
    error && typeof error === "object"
      ? (error as { name?: unknown; digest?: unknown })
      : {};
  const errorName =
    typeof record.name === "string" && SAFE_ERROR_NAMES.has(record.name)
      ? record.name
      : "Error";
  const event: ApplicationErrorEvent = {
    event: "application_error",
    source,
    route: safeRoute(path),
    errorName,
  };
  if (typeof record.digest === "string" && DIGEST_PATTERN.test(record.digest))
    event.digest = record.digest;
  return event;
}

export function isClientErrorEvent(
  value: unknown,
): value is ApplicationErrorEvent & { source: ClientErrorSource } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort().join(",");
  if (
    keys !== "errorName,event,route,source" &&
    keys !== "digest,errorName,event,route,source"
  )
    return false;
  if (
    record.event !== "application_error" ||
    !(CLIENT_ERROR_SOURCES as readonly unknown[]).includes(record.source)
  )
    return false;
  if (
    typeof record.route !== "string" ||
    !(SAFE_ROUTES.has(record.route) || record.route === "unknown")
  )
    return false;
  if (
    typeof record.errorName !== "string" ||
    !SAFE_ERROR_NAMES.has(record.errorName)
  )
    return false;
  return (
    record.digest === undefined ||
    (typeof record.digest === "string" && DIGEST_PATTERN.test(record.digest))
  );
}
