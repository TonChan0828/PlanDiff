import {
  buildErrorEvent,
  type ClientErrorSource,
} from "@/lib/monitoring/events";

const REPORT_URL = "/api/monitoring/errors";
const DEDUPE_WINDOW_MS = 60_000;
const MAX_RECENT_EVENTS = 100;
const recent = new Map<string, number>();

/** Sends only a sanitized route, error class, and framework digest to the same-origin logger. */
export function reportClientError(
  error: unknown,
  source: ClientErrorSource,
): void {
  try {
    if (typeof window === "undefined") return;
    const route = window.location.pathname;
    const event = buildErrorEvent(error, source, route);
    const key = `${event.source}:${event.route}:${event.errorName}:${event.digest ?? ""}`;
    const now = Date.now();
    for (const [entry, timestamp] of recent)
      if (now - timestamp > DEDUPE_WINDOW_MS) recent.delete(entry);
    if (recent.has(key)) return;
    if (recent.size >= MAX_RECENT_EVENTS)
      recent.delete(recent.keys().next().value!);
    recent.set(key, now);
    void fetch(REPORT_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Monitoring never changes whether the application can render or recover.
  }
}
